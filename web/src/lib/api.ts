import type {
  GitPlatform,
  ScanErrorResponse,
  ScanReport,
} from '@repo-checkup/shared';

export class ScanApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ScanApiError';
    this.code = code;
  }
}

export async function scanRepository(repoUrl: string): Promise<ScanReport> {
  const response = await fetch('/api/scan', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ repoUrl }),
  });

  const payload = (await response.json().catch(() => null)) as
    | ScanReport
    | ScanErrorResponse
    | null;

  if (!response.ok) {
    const errPayload = payload as ScanErrorResponse | null;
    throw new ScanApiError(
      errPayload?.code ?? 'REQUEST_FAILED',
      errPayload?.error ?? `请求失败（HTTP ${response.status}）`,
    );
  }

  return payload as ScanReport;
}

export interface InputHint {
  platform: GitPlatform | null;
  branch: string | null;
}

export function detectInputHint(rawUrl: string): InputHint {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { platform: null, branch: null };
  }

  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');

    let platform: GitPlatform | null = null;
    if (host === 'github.com') platform = 'github';
    else if (host === 'gitee.com') platform = 'gitee';
    else if (host === 'gitcode.com' || host === 'gitcode.net') {
      platform = 'gitcode';
    }

    const segments = url.pathname.split('/').filter(Boolean);
    let branch: string | null = null;
    if (segments[2] === 'tree' && segments.length >= 4) {
      branch = decodeURIComponent(segments.slice(3).join('/'));
    } else if (
      segments[2] === '-' &&
      segments[3] === 'tree' &&
      segments.length >= 5
    ) {
      branch = decodeURIComponent(segments.slice(4).join('/'));
    }

    return { platform, branch };
  } catch {
    return { platform: null, branch: null };
  }
}
