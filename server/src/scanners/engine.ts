import fs from 'node:fs/promises';
import path from 'node:path';
import type { ScannedFile, ScannerModule, ScannerResult } from './types.js';

const MAX_FILES = 3000;
const MAX_TEXT_FILE_BYTES = 512 * 1024;
const NUL_CHECK_BYTES = 8192;

const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  'vendor',
  'target',
  '__pycache__',
  '.venv',
  'venv',
  '.idea',
  '.vscode',
  'coverage',
  '.turbo',
  '.cache',
]);

const LOCKFILES = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'poetry.lock',
  'cargo.lock',
  'composer.lock',
  'gemfile.lock',
  'go.sum',
]);

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.bmp',
  '.svgz',
  '.mp3',
  '.mp4',
  '.wav',
  '.avi',
  '.mov',
  '.zip',
  '.tar',
  '.gz',
  '.bz2',
  '.7z',
  '.rar',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.otf',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.pyc',
  '.class',
  '.jar',
  '.war',
  '.wasm',
  '.sqlite',
  '.db',
]);

export interface EngineRunOutput {
  scannedFiles: number;
  skippedFiles: number;
  results: ScannerResult[];
}

function toPosixRelative(repoDir: string, fullPath: string): string {
  return path.relative(repoDir, fullPath).split(path.sep).join('/');
}

function containsNulByte(buf: Buffer): boolean {
  const limit = Math.min(buf.length, NUL_CHECK_BYTES);
  for (let i = 0; i < limit; i++) {
    if (buf[i] === 0) {
      return true;
    }
  }
  return false;
}

export async function collectScannedFiles(repoDir: string): Promise<{
  files: ScannedFile[];
  scannedFiles: number;
  skippedFiles: number;
}> {
  const files: ScannedFile[] = [];
  let skippedFiles = 0;
  const queue: string[] = [repoDir];

  while (queue.length > 0) {
    const currentDir = queue.shift()!;
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        skippedFiles++;
        continue;
      }

      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) {
          skippedFiles++;
          continue;
        }
        queue.push(fullPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (files.length >= MAX_FILES) {
        skippedFiles++;
        continue;
      }

      const relativePath = toPosixRelative(repoDir, fullPath);
      const stat = await fs.lstat(fullPath);
      const lowerName = entry.name.toLowerCase();
      const ext = path.extname(lowerName);

      if (
        stat.size > MAX_TEXT_FILE_BYTES ||
        LOCKFILES.has(lowerName) ||
        BINARY_EXTENSIONS.has(ext)
      ) {
        files.push({
          relativePath,
          sizeBytes: stat.size,
          isText: false,
        });
        skippedFiles++;
        continue;
      }

      const buf = await fs.readFile(fullPath);
      if (containsNulByte(buf)) {
        files.push({
          relativePath,
          sizeBytes: stat.size,
          isText: false,
        });
        skippedFiles++;
        continue;
      }

      files.push({
        relativePath,
        sizeBytes: stat.size,
        isText: true,
        content: buf.toString('utf8'),
      });
    }
  }

  return {
    files,
    scannedFiles: files.length,
    skippedFiles,
  };
}

export async function runScanners(
  repoDir: string,
  modules: ScannerModule[],
): Promise<EngineRunOutput> {
  const { files, scannedFiles, skippedFiles } =
    await collectScannedFiles(repoDir);

  const results = await Promise.all(
    modules.map((mod) => mod.scan({ repoDir, files })),
  );

  return {
    scannedFiles,
    skippedFiles,
    results,
  };
}
