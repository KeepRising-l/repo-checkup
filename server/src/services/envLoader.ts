import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function stripQuotes(raw: string): string {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseEnvContent(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const normalized = line.startsWith('export ')
      ? line.slice('export '.length).trim()
      : line;

    const eqIdx = normalized.indexOf('=');
    if (eqIdx <= 0) {
      continue;
    }

    const key = normalized.slice(0, eqIdx).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }

    const rawVal = normalized.slice(eqIdx + 1);
    result[key] = stripQuotes(rawVal);
  }

  return result;
}

function formatEnvValue(value: string): string {
  const sanitized = value.replace(/[\r\n]/g, '');
  if (!sanitized || /[\s#"'\\]/.test(sanitized)) {
    const escaped = sanitized.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}"`;
  }
  return sanitized;
}

export function getWorkspaceEnvPath(): string {
  const currentFileDir = path.dirname(fileURLToPath(import.meta.url));
  const serverRoot = path.resolve(currentFileDir, '..', '..');
  const workspaceRoot = path.resolve(serverRoot, '..');
  return path.join(workspaceRoot, '.env');
}

export function upsertEnvFile(
  envFilePath: string,
  updates: Record<string, string | undefined>,
): void {
  const cleanUpdates = new Map<string, string>();
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined && /^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      cleanUpdates.set(key, value);
    }
  }

  const existingLines = fs.existsSync(envFilePath)
    ? fs.readFileSync(envFilePath, 'utf8').split(/\r?\n/)
    : [];

  while (
    existingLines.length > 0 &&
    existingLines[existingLines.length - 1] === ''
  ) {
    existingLines.pop();
  }

  const updatedKeys = new Set<string>();
  const nextLines = existingLines.map((rawLine) => {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return rawLine;
    }
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(trimmed);
    const key = match?.[1];
    if (key && cleanUpdates.has(key)) {
      updatedKeys.add(key);
      return `${key}=${formatEnvValue(cleanUpdates.get(key)!)}`;
    }
    return rawLine;
  });

  for (const [key, value] of cleanUpdates.entries()) {
    if (!updatedKeys.has(key)) {
      nextLines.push(`${key}=${formatEnvValue(value)}`);
    }
  }

  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(envFilePath, `${nextLines.join('\n')}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

/**
 * Loads `.env` from workspace root and server directory without overwriting existing `process.env` keys.
 */
export function loadLocalEnv(baseDirs?: string[]): void {
  const currentFileDir = path.dirname(fileURLToPath(import.meta.url));
  const serverRoot = path.resolve(currentFileDir, '..', '..');
  const workspaceRoot = path.resolve(serverRoot, '..');

  const candidateDirs = baseDirs ?? [
    workspaceRoot,
    serverRoot,
    process.cwd(),
  ];

  const seenDirs = new Set<string>();
  for (const dir of candidateDirs) {
    const resolvedDir = path.resolve(dir);
    if (seenDirs.has(resolvedDir)) {
      continue;
    }
    seenDirs.add(resolvedDir);

    const envPath = path.join(resolvedDir, '.env');
    if (!fs.existsSync(envPath)) {
      continue;
    }

    try {
      const content = fs.readFileSync(envPath, 'utf8');
      const parsed = parseEnvContent(content);
      for (const [key, value] of Object.entries(parsed)) {
        if (process.env[key] === undefined) {
          process.env[key] = value;
        }
      }
    } catch {
      // Ignore unreadable .env files and keep running.
    }
  }
}
