import type {
  AiAdviceReport,
  AiAdviceRequest,
  AiClientConfig,
  AiConfigStatus,
  AiModelsRequest,
  AiModelsResponse,
  GitPlatform,
  ScanErrorResponse,
  ScanProgressEvent,
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

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | T
    | ScanErrorResponse
    | null;

  if (!response.ok) {
    const errPayload = payload as ScanErrorResponse | null;
    throw new ScanApiError(
      errPayload?.code ?? 'REQUEST_FAILED',
      errPayload?.error ?? `请求失败（HTTP ${response.status}）`,
    );
  }

  return payload as T;
}

export async function scanRepository(repoUrl: string): Promise<ScanReport> {
  const response = await fetch('/api/scan', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ repoUrl }),
  });

  return parseJsonResponse<ScanReport>(response);
}

export async function scanRepositoryStream(
  repoUrl: string,
  onProgress: (event: ScanProgressEvent) => void,
): Promise<ScanReport> {
  const response = await fetch('/api/scan/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ repoUrl }),
  });

  if (!response.ok) {
    const errPayload = (await response.json().catch(() => null)) as
      | ScanErrorResponse
      | null;
    throw new ScanApiError(
      errPayload?.code ?? 'REQUEST_FAILED',
      errPayload?.error ?? `请求失败（HTTP ${response.status}）`,
    );
  }

  if (!response.body) {
    throw new ScanApiError('STREAM_UNAVAILABLE', '无法读取扫描进度流');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalReport: ScanReport | null = null;

  const processFrame = (rawFrame: string) => {
    const lines = rawFrame.split('\n');
    let eventName = 'message';
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice('event:'.length).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice('data:'.length).trimStart());
      }
    }

    if (dataLines.length === 0) {
      return;
    }

    const dataText = dataLines.join('\n');
    if (eventName === 'progress') {
      const parsed = JSON.parse(dataText) as ScanProgressEvent;
      onProgress(parsed);
    } else if (eventName === 'complete') {
      finalReport = JSON.parse(dataText) as ScanReport;
    } else if (eventName === 'error') {
      const err = JSON.parse(dataText) as ScanErrorResponse;
      throw new ScanApiError(err.code || 'SCAN_FAILED', err.error);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    let sepIdx = buffer.indexOf('\n\n');
    while (sepIdx !== -1) {
      const frame = buffer.slice(0, sepIdx);
      buffer = buffer.slice(sepIdx + 2);
      if (frame.trim()) {
        processFrame(frame);
      }
      sepIdx = buffer.indexOf('\n\n');
    }
  }

  if (buffer.trim()) {
    processFrame(buffer);
  }

  if (!finalReport) {
    throw new ScanApiError('SCAN_INCOMPLETE', '扫描流意外中断，未收到最终报告');
  }

  return finalReport;
}

export async function getAiConfigStatus(): Promise<AiConfigStatus> {
  const response = await fetch('/api/ai/config');
  return parseJsonResponse<AiConfigStatus>(response);
}

export async function saveAiConfig(
  config: AiClientConfig,
): Promise<AiConfigStatus> {
  const response = await fetch('/api/ai/config', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });

  return parseJsonResponse<AiConfigStatus>(response);
}

export async function fetchAiModels(
  request: AiModelsRequest,
): Promise<AiModelsResponse> {
  const response = await fetch('/api/ai/models', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  return parseJsonResponse<AiModelsResponse>(response);
}

export async function generateAiAdvice(
  request: AiAdviceRequest,
): Promise<AiAdviceReport> {
  const response = await fetch('/api/ai/advice', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  return parseJsonResponse<AiAdviceReport>(response);
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
