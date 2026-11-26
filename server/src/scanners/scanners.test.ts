import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildScanReport } from '../scoring.js';
import { removeDirectoryCrossPlatform } from '../services/gitClone.js';
import { runScanners } from './engine.js';
import { defaultScanners } from './index.js';
import { maskSecret } from './secrets.js';

const tempFixtures: string[] = [];

async function createFixtureRepo(
  files: Record<string, string>,
): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-checkup-scan-'));
  tempFixtures.push(dir);
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = path.join(dir, relPath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf8');
  }
  return dir;
}

afterAll(async () => {
  await Promise.all(
    tempFixtures.map((dir) => removeDirectoryCrossPlatform(dir).catch(() => {})),
  );
});

const baseRepoMeta = {
  platform: 'github' as const,
  owner: 'demo',
  repo: 'sample',
  cloneUrl: 'https://github.com/demo/sample.git',
  webUrl: 'https://github.com/demo/sample',
  scannedBranch: 'main',
  commitSha: '1234567890abcdef1234567890abcdef12345678',
  commitShortSha: '1234567',
  scannedFiles: 0,
  skippedFiles: 0,
  durationMs: 12,
};

describe('scanners & scoring', () => {
  it('scores 100 (ready) for a clean, complete repository with .env.example', async () => {
    const dir = await createFixtureRepo({
      'README.md': '# Demo App\n',
      'package.json': JSON.stringify({
        name: 'demo',
        scripts: { dev: 'vite', build: 'vite build' },
      }),
      '.env.example': 'API_KEY=your_key_here\n',
      'src/index.ts': 'export const ok = true;\n',
    });

    const out = await runScanners(dir, defaultScanners);
    const report = buildScanReport(
      { ...baseRepoMeta, scannedFiles: out.scannedFiles, skippedFiles: out.skippedFiles },
      out.results,
    );

    expect(report.totalScore).toBe(100);
    expect(report.readinessLevel).toBe('ready');
    expect(report.hasBlockingRisk).toBe(false);
    expect(report.risks).toHaveLength(0);
  });

  it('detects missing completeness files and Windows-only scripts (with sibling downgrade)', async () => {
    const dir = await createFixtureRepo({
      'scripts/deploy.ps1': 'Write-Host "hi"\n',
      'gradlew.bat': '@echo off\n',
      gradlew: '#!/bin/sh\n',
      'src/app.ts': 'console.log("hello");\n',
    });

    const out = await runScanners(dir, defaultScanners);
    const report = buildScanReport(baseRepoMeta, out.results);

    const comp = report.dimensions.find((d) => d.id === 'completeness');
    const win = report.dimensions.find((d) => d.id === 'windows_scripts');

    expect(comp?.score).toBe(0);
    expect(comp?.issueCount).toBe(3);

    // 20 - 6 (deploy.ps1) - 2 (gradlew.bat with sibling gradlew) = 12
    expect(win?.score).toBe(12);
    expect(
      report.risks.find((r) => r.filePath === 'gradlew.bat')?.severity,
    ).toBe('low');
    expect(
      report.risks.find((r) => r.filePath === 'scripts/deploy.ps1')?.severity,
    ).toBe('medium');
  });

  it('detects hardcoded Windows and macOS paths in code while ignoring markdown docs', async () => {
    const dir = await createFixtureRepo({
      'README.md': 'Example path C:\\Users\\alice\\demo and /Users/alice/demo\n',
      'package.json': JSON.stringify({ scripts: { start: 'node index.js' } }),
      'src/config.ts': [
        'const winPath = "C:\\\\Users\\\\alice\\\\data";',
        'const macPath = "/Users/alice/workspace/app";',
      ].join('\n'),
    });

    const out = await runScanners(dir, defaultScanners);
    const pathRisks = out.results
      .find((r) => r.dimension === 'hardcoded_paths')
      ?.risks ?? [];

    expect(pathRisks).toHaveLength(2);
    expect(pathRisks.every((r) => r.filePath === 'src/config.ts')).toBe(true);
    expect(pathRisks.map((r) => r.line)).toEqual([1, 2]);
  });

  it('detects committed .env and secret patterns, masks snippets, and flags high_risk blocking', async () => {
    const fakeSk = ['sk-proj-', 'AbCdEfGhIjKlMnOpQrStUvWxYz123456'].join('');
    const fakeAkid = ['AKID', 'z8krbsJ5yKBZQpn74WFkmLPx3demo001'].join('');
    const fakeBearer = [
      'Bearer ',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
      '.payload.sig',
    ].join('');
    const fakePem = ['-----BEGIN ', 'RSA PRIVATE KEY-----'].join('');
    const fakePlaceholder = [
      'sk-example-',
      'placeholder-123456789012345',
    ].join('');

    const dir = await createFixtureRepo({
      'README.md': '# Leak Demo\n',
      'package.json': JSON.stringify({ scripts: { start: 'node app.js' } }),
      '.env': 'DB_PASS=secret\n',
      'src/secrets.ts': [
        `const a = "${fakeSk}";`,
        `const b = "${fakeAkid}";`,
        `const c = "${fakeBearer}";`,
        `const k = "${fakePem}";`,
        `const placeholder = "${fakePlaceholder}";`,
      ].join('\n'),
    });

    const out = await runScanners(dir, defaultScanners);
    const report = buildScanReport(baseRepoMeta, out.results);

    expect(report.hasBlockingRisk).toBe(true);
    expect(report.readinessLevel).toBe('high_risk');

    const secretRisks = report.risks.filter((r) => r.dimension === 'secrets');
    expect(secretRisks).toHaveLength(5);

    const serialized = JSON.stringify(secretRisks);
    expect(serialized).not.toContain(fakeSk);
    expect(serialized).not.toContain(fakeAkid);
    expect(serialized).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig');
    expect(maskSecret(fakeSk)).toBe('sk-p****3456');
  });
});
