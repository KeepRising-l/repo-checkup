import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';
import {
  cloneFromTarget,
  GitCloneError,
  removeDirectoryCrossPlatform,
} from './gitClone.js';

const execFileAsync = promisify(execFile);

const tempDirsToClean: string[] = [];

async function runGitLocal(cwd: string, args: string[]): Promise<void> {
  await execFileAsync('git', args, {
    cwd,
    windowsHide: true,
    env: { ...process.env, LC_ALL: 'C' },
  });
}

afterAll(async () => {
  await Promise.all(
    tempDirsToClean.map((dir) =>
      removeDirectoryCrossPlatform(dir).catch(() => {}),
    ),
  );
});

describe('gitClone & cross-platform cleanup', () => {
  it('removes directories containing read-only pack-like files', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-checkup-rm-'));
    tempDirsToClean.push(dir);

    const packDir = path.join(dir, '.git', 'objects', 'pack');
    await fs.mkdir(packDir, { recursive: true });
    const packFile = path.join(packDir, 'pack-test.idx');
    await fs.writeFile(packFile, 'readonly-content', 'utf8');
    await fs.chmod(packFile, 0o444);

    await removeDirectoryCrossPlatform(dir);

    await expect(fs.access(dir)).rejects.toThrow();
  });

  it('clones default and specific branches, extracts branch/commit metadata, strips .git, and cleans up', async () => {
    const originDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'repo-checkup-origin-'),
    );
    tempDirsToClean.push(originDir);

    await runGitLocal(originDir, ['init', '-b', 'main']);
    await runGitLocal(originDir, ['config', 'user.name', 'Test Bot']);
    await runGitLocal(originDir, ['config', 'user.email', 'test@example.com']);

    await fs.writeFile(path.join(originDir, 'README.md'), '# Demo\n', 'utf8');
    await runGitLocal(originDir, ['add', '.']);
    await runGitLocal(originDir, ['commit', '-m', 'init main commit']);

    await runGitLocal(originDir, ['checkout', '-b', 'feat/check']);
    await fs.writeFile(path.join(originDir, 'feature.txt'), 'feat\n', 'utf8');
    await runGitLocal(originDir, ['add', '.']);
    await runGitLocal(originDir, ['commit', '-m', 'feat branch commit']);

    await runGitLocal(originDir, ['checkout', 'main']);

    const defaultClone = await cloneFromTarget(originDir);
    try {
      expect(defaultClone.scannedBranch).toBe('main');
      expect(defaultClone.commitSha).toMatch(/^[0-9a-f]{40}$/);
      expect(defaultClone.commitShortSha.length).toBeGreaterThanOrEqual(7);
      expect(defaultClone.commitMessage).toBe('init main commit');
      await expect(
        fs.access(path.join(defaultClone.repoDir, '.git')),
      ).rejects.toThrow();
      await expect(
        fs.access(path.join(defaultClone.repoDir, 'README.md')),
      ).resolves.toBeUndefined();
    } finally {
      await defaultClone.cleanup();
    }
    await expect(fs.access(defaultClone.tempRoot)).rejects.toThrow();

    const branchClone = await cloneFromTarget(originDir, 'feat/check');
    try {
      expect(branchClone.scannedBranch).toBe('feat/check');
      expect(branchClone.commitMessage).toBe('feat branch commit');
      await expect(
        fs.access(path.join(branchClone.repoDir, 'feature.txt')),
      ).resolves.toBeUndefined();
    } finally {
      await branchClone.cleanup();
    }

    await expect(
      cloneFromTarget(originDir, 'non-existent-branch'),
    ).rejects.toThrowError(GitCloneError);
  });
});
