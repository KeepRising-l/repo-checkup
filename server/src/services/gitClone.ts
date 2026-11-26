import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { ParsedRepoUrl } from './repoUrl.js';

const execFileAsync = promisify(execFile);

const DEFAULT_CLONE_TIMEOUT_MS = 45_000;
const GIT_EXEC_TIMEOUT_MS = 10_000;
const MAX_GIT_BUFFER = 10 * 1024 * 1024;

export type GitCloneErrorCode =
  | 'CLONE_TIMEOUT'
  | 'REPO_NOT_FOUND'
  | 'BRANCH_NOT_FOUND'
  | 'CLONE_FAILED'
  | 'GIT_NOT_INSTALLED';

export class GitCloneError extends Error {
  readonly code: GitCloneErrorCode;

  constructor(code: GitCloneErrorCode, message: string) {
    super(message);
    this.name = 'GitCloneError';
    this.code = code;
  }
}

export interface CloneResult {
  tempRoot: string;
  repoDir: string;
  scannedBranch: string;
  commitSha: string;
  commitShortSha: string;
  commitMessage?: string;
  commitDate?: string;
  cleanup: () => Promise<void>;
}

export interface CloneProgressInfo {
  stage: 'clone' | 'metadata';
  percent: number;
  label: string;
  detail?: string;
}

export interface CloneOptions {
  timeoutMs?: number;
  baseTempDir?: string;
  onProgress?: (info: CloneProgressInfo) => void;
}

function buildGitEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GIT_ASKPASS: 'echo',
    GCM_INTERACTIVE: 'never',
    LC_ALL: 'C',
  };
}

async function runGit(
  args: string[],
  options: { cwd?: string; timeoutMs: number },
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync('git', args, {
    cwd: options.cwd,
    timeout: options.timeoutMs,
    maxBuffer: MAX_GIT_BUFFER,
    windowsHide: true,
    env: buildGitEnv(),
  });
}

async function ensureWritableTree(targetPath: string): Promise<void> {
  let stat;
  try {
    stat = await fs.lstat(targetPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }
    throw error;
  }

  if (stat.isSymbolicLink()) {
    return;
  }

  if (stat.isDirectory()) {
    await fs.chmod(targetPath, 0o700).catch(() => {});
    const entries = await fs.readdir(targetPath).catch(() => [] as string[]);
    for (const entry of entries) {
      await ensureWritableTree(path.join(targetPath, entry));
    }
  } else {
    // Clear read-only flags on Windows (.git/objects/pack/*) and ensure macOS/Linux writability.
    await fs.chmod(targetPath, 0o666).catch(() => {});
  }
}

/**
 * Cross-platform directory removal safe for Windows read-only `.git` packfiles and macOS/Linux.
 */
export async function removeDirectoryCrossPlatform(
  targetDir: string,
): Promise<void> {
  try {
    await ensureWritableTree(targetDir);
    await fs.rm(targetDir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 150,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }
    throw error;
  }
}

function mapGitCloneFailure(
  error: unknown,
  requestedBranch?: string,
): GitCloneError {
  const err = error as NodeJS.ErrnoException & {
    killed?: boolean;
    signal?: string;
    stderr?: string;
    stdout?: string;
  };

  if (err.code === 'ENOENT') {
    return new GitCloneError(
      'GIT_NOT_INSTALLED',
      '服务器未检测到可用的 git 命令，请先安装 Git',
    );
  }

  if (err.killed || err.signal === 'SIGTERM') {
    return new GitCloneError(
      'CLONE_TIMEOUT',
      '拉取仓库超时，请确认仓库体积适中且网络可访问',
    );
  }

  const stderr = `${err.stderr ?? ''}\n${err.message ?? ''}`.toLowerCase();

  if (
    requestedBranch &&
    (stderr.includes('remote branch') ||
      stderr.includes('not found in upstream origin') ||
      stderr.includes('did not match any file(s) known to git'))
  ) {
    return new GitCloneError(
      'BRANCH_NOT_FOUND',
      `未在远程仓库中找到分支「${requestedBranch}」`,
    );
  }

  if (
    stderr.includes('repository not found') ||
    stderr.includes('does not exist') ||
    stderr.includes('could not read username') ||
    stderr.includes('authentication failed') ||
    stderr.includes('terminal prompts disabled') ||
    stderr.includes('access denied') ||
    stderr.includes('404')
  ) {
    return new GitCloneError(
      'REPO_NOT_FOUND',
      '无法访问该仓库，请确认链接正确且为公开仓库',
    );
  }

  return new GitCloneError(
    'CLONE_FAILED',
    '拉取仓库失败，请稍后重试或检查仓库链接是否可公开访问',
  );
}

async function readGitMetadata(
  repoDir: string,
  requestedBranch?: string,
): Promise<{
  scannedBranch: string;
  commitSha: string;
  commitShortSha: string;
  commitMessage?: string;
  commitDate?: string;
}> {
  let scannedBranch = requestedBranch ?? '';

  try {
    const { stdout } = await runGit(['symbolic-ref', '--short', 'HEAD'], {
      cwd: repoDir,
      timeoutMs: GIT_EXEC_TIMEOUT_MS,
    });
    if (stdout.trim()) {
      scannedBranch = stdout.trim();
    }
  } catch {
    try {
      const { stdout } = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd: repoDir,
        timeoutMs: GIT_EXEC_TIMEOUT_MS,
      });
      const fallback = stdout.trim();
      if (fallback && fallback !== 'HEAD') {
        scannedBranch = fallback;
      }
    } catch {
      // Keep fallback value below.
    }
  }

  if (!scannedBranch) {
    scannedBranch = requestedBranch ?? 'HEAD';
  }

  let commitSha = '';
  let commitShortSha = '';
  let commitDate: string | undefined;
  let commitMessage: string | undefined;

  try {
    const { stdout } = await runGit(
      ['log', '-1', '--format=%H%n%h%n%cI%n%s'],
      {
        cwd: repoDir,
        timeoutMs: GIT_EXEC_TIMEOUT_MS,
      },
    );
    const lines = stdout.trim().split(/\r?\n/);
    commitSha = lines[0]?.trim() ?? '';
    commitShortSha = lines[1]?.trim() || commitSha.slice(0, 7);
    commitDate = lines[2]?.trim() || undefined;
    commitMessage = lines.slice(3).join(' ').trim() || undefined;
  } catch {
    // Empty repo with no commits will keep empty SHA fields.
  }

  return {
    scannedBranch,
    commitSha,
    commitShortSha,
    ...(commitDate ? { commitDate } : {}),
    ...(commitMessage ? { commitMessage } : {}),
  };
}

async function runGitCloneWithProgress(
  args: string[],
  timeoutMs: number,
  onProgress?: (info: CloneProgressInfo) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: buildGitEnv(),
    });

    const stderrChunks: string[] = [];
    let pendingFragment = '';
    let lastPercent = 12;
    let timedOut = false;
    let settled = false;

    const emit = (
      stage: 'clone' | 'metadata',
      percent: number,
      label: string,
      detail?: string,
    ) => {
      if (percent > lastPercent || (percent === lastPercent && detail)) {
        lastPercent = Math.max(lastPercent, percent);
        onProgress?.({ stage, percent: lastPercent, label, detail });
      }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    const parseProgressLine = (line: string) => {
      const receiving = /Receiving objects:\s*(\d+)%/i.exec(line);
      if (receiving?.[1]) {
        const pct = Number(receiving[1]);
        const mapped = 15 + Math.round((pct / 100) * 37);
        emit('clone', mapped, '正在拉取仓库数据', `Receiving objects: ${pct}%`);
        return;
      }

      const resolving = /Resolving deltas:\s*(\d+)%/i.exec(line);
      if (resolving?.[1]) {
        const pct = Number(resolving[1]);
        const mapped = 52 + Math.round((pct / 100) * 10);
        emit('clone', mapped, '正在解析增量对象', `Resolving deltas: ${pct}%`);
        return;
      }

      const updating = /Updating files:\s*(\d+)%/i.exec(line);
      if (updating?.[1]) {
        const pct = Number(updating[1]);
        const mapped = 62 + Math.round((pct / 100) * 6);
        emit('clone', mapped, '正在检出工作区文件', `Updating files: ${pct}%`);
        return;
      }

      if (/Cloning into/i.test(line)) {
        emit('clone', 14, '正在建立仓库连接');
      }
    };

    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      stderrChunks.push(text);
      const combined = pendingFragment + text;
      const parts = combined.split(/[\r\n]+/);
      pendingFragment = /[\r\n]$/.test(combined) ? '' : (parts.pop() ?? '');
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed) {
          parseProgressLine(trimmed);
        }
      }
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (pendingFragment.trim()) {
        parseProgressLine(pendingFragment.trim());
      }

      const stderr = stderrChunks.join('');
      if (timedOut || signal === 'SIGTERM') {
        reject({ killed: true, signal: 'SIGTERM', stderr });
        return;
      }
      if (code !== 0) {
        reject({ code, stderr });
        return;
      }
      resolve();
    });
  });
}

/**
 * Low-level shallow clone helper (also usable in tests against local git repositories).
 */
export async function cloneFromTarget(
  cloneTarget: string,
  requestedBranch?: string,
  options: CloneOptions = {},
): Promise<CloneResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_CLONE_TIMEOUT_MS;
  const baseTempDir = options.baseTempDir ?? os.tmpdir();
  const tempRoot = await fs.mkdtemp(path.join(baseTempDir, 'repo-checkup-'));
  const repoDir = path.join(tempRoot, 'repo');

  const cleanup = () => removeDirectoryCrossPlatform(tempRoot);

  const cloneArgs = [
    'clone',
    '--progress',
    '--depth',
    '1',
    '--single-branch',
    '-c',
    'core.longpaths=true',
    '-c',
    'core.autocrlf=false',
    '-c',
    'core.symlinks=false',
  ];

  if (requestedBranch) {
    cloneArgs.push('--branch', requestedBranch);
  }

  cloneArgs.push('--', cloneTarget, repoDir);

  try {
    options.onProgress?.({
      stage: 'clone',
      percent: 12,
      label: '正在连接远程仓库并浅克隆',
    });
    await runGitCloneWithProgress(cloneArgs, timeoutMs, options.onProgress);
    options.onProgress?.({
      stage: 'metadata',
      percent: 70,
      label: '正在提取分支与 Commit 快照',
    });
    const meta = await readGitMetadata(repoDir, requestedBranch);
    // Remove .git immediately after reading branch/commit metadata so scanners never inspect it
    // and Windows read-only packfile handles are cleared early.
    await removeDirectoryCrossPlatform(path.join(repoDir, '.git'));
    options.onProgress?.({
      stage: 'metadata',
      percent: 74,
      label: '已清理 .git 目录，准备扫描文件',
    });

    return {
      tempRoot,
      repoDir,
      ...meta,
      cleanup,
    };
  } catch (error) {
    await cleanup().catch(() => {});
    if (error instanceof GitCloneError) {
      throw error;
    }
    throw mapGitCloneFailure(error, requestedBranch);
  }
}

export async function cloneRepository(
  parsed: ParsedRepoUrl,
  options?: CloneOptions,
): Promise<CloneResult> {
  return cloneFromTarget(parsed.cloneUrl, parsed.requestedBranch, options);
}
