import { z } from 'zod';
import type {
  AiAdviceItem,
  AiAdviceReport,
  AiClientConfig,
  AiConfigStatus,
  AiModelsRequest,
  AiModelsResponse,
  RiskSeverity,
  ScanReport,
} from '@repo-checkup/shared';
import { getWorkspaceEnvPath, upsertEnvFile } from './envLoader.js';

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const MODELS_TIMEOUT_MS = 15_000;
const ADVICE_TIMEOUT_MS = 60_000;

export type AiServiceErrorCode =
  | 'NO_API_KEY'
  | 'INVALID_BASE_URL'
  | 'MISSING_MODEL'
  | 'UPSTREAM_ERROR'
  | 'INVALID_AI_OUTPUT'
  | 'TIMEOUT';

export class AiServiceError extends Error {
  readonly code: AiServiceErrorCode;

  constructor(code: AiServiceErrorCode, message: string) {
    super(message);
    this.name = 'AiServiceError';
    this.code = code;
  }
}

const aiResponseItemSchema = z.object({
  title: z.string().trim().min(1),
  severity: z.enum(['high', 'medium', 'low']),
  summary: z.string().trim().min(1),
  detail: z.object({
    whyItMatters: z.string().trim().min(1),
    relatedFiles: z.array(z.string().trim().min(1)).default([]),
    actionSteps: z.array(z.string().trim().min(1)).min(1),
    expectedImpact: z.string().trim().min(1),
  }),
});

const aiResponsePayloadSchema = z.object({
  aiScore: z.number(),
  overview: z.string().trim().min(1),
  items: z.array(aiResponseItemSchema).min(1).max(8),
});

const SEVERITY_RANK: Record<RiskSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function readEnvAiDefaults(): {
  baseUrl: string;
  apiKey: string;
  model: string;
} {
  const baseUrl =
    process.env.AI_BASE_URL?.trim() ||
    process.env.OPENAI_BASE_URL?.trim() ||
    DEFAULT_OPENAI_BASE_URL;
  const apiKey =
    process.env.AI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim() || '';
  const model =
    process.env.AI_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || '';

  return { baseUrl, apiKey, model };
}

export function getAiConfigStatus(): AiConfigStatus {
  const env = readEnvAiDefaults();
  const explicitBaseUrl =
    process.env.AI_BASE_URL?.trim() || process.env.OPENAI_BASE_URL?.trim();
  return {
    hasEnvConfig: Boolean(env.apiKey),
    ...(explicitBaseUrl ? { defaultBaseUrl: explicitBaseUrl } : {}),
    ...(env.model ? { defaultModel: env.model } : {}),
  };
}

export function saveAiConfig(
  input: AiClientConfig,
  envFilePath?: string,
): AiConfigStatus {
  const rawKey = input.apiKey?.trim() ?? '';
  const rawBaseUrl = input.baseUrl?.trim() ?? '';
  const rawModel = input.model?.trim() ?? '';

  const existingKey =
    process.env.AI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim() || '';
  const effectiveKey = rawKey || existingKey;
  if (!effectiveKey) {
    throw new AiServiceError('NO_API_KEY', '请先填写 API Key 后再保存到本地 .env');
  }

  const existingBaseUrl =
    process.env.AI_BASE_URL?.trim() ||
    process.env.OPENAI_BASE_URL?.trim() ||
    '';
  const candidateBaseUrl = rawBaseUrl || existingBaseUrl;
  if (!candidateBaseUrl) {
    throw new AiServiceError(
      'INVALID_BASE_URL',
      '请先选择或填写 Base URL 后再保存',
    );
  }
  const effectiveBaseUrl = normalizeBaseUrl(candidateBaseUrl);

  const targetEnvPath = envFilePath ?? getWorkspaceEnvPath();
  upsertEnvFile(targetEnvPath, {
    AI_BASE_URL: effectiveBaseUrl,
    AI_API_KEY: effectiveKey,
    ...(rawModel ? { AI_MODEL: rawModel } : {}),
  });

  process.env.AI_BASE_URL = effectiveBaseUrl;
  process.env.AI_API_KEY = effectiveKey;
  if (rawModel) {
    process.env.AI_MODEL = rawModel;
  }

  return getAiConfigStatus();
}

export function normalizeBaseUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new AiServiceError('INVALID_BASE_URL', 'Base URL 不能为空');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new AiServiceError(
      'INVALID_BASE_URL',
      'Base URL 格式不正确，请输入完整的 http:// 或 https:// 地址',
    );
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new AiServiceError(
      'INVALID_BASE_URL',
      'Base URL 仅支持 http:// 或 https:// 协议',
    );
  }

  let pathname = parsed.pathname.replace(/\/+$/, '');
  pathname = pathname.replace(/\/(?:chat\/completions|models)$/i, '');

  return `${parsed.origin}${pathname}`;
}

function resolveCredentials(override?: AiClientConfig): {
  baseUrl: string;
  apiKey: string;
  model: string;
  source: 'env' | 'custom';
} {
  const env = readEnvAiDefaults();
  const customApiKey = override?.apiKey?.trim() ?? '';
  const customBaseUrl = override?.baseUrl?.trim() ?? '';
  const customModel = override?.model?.trim() ?? '';

  const apiKey = customApiKey || env.apiKey;
  if (!apiKey) {
    throw new AiServiceError(
      'NO_API_KEY',
      '未检测到可用的 AI API Key，请先在本地 .env 配置或在下方填写 Base URL 与 API Key',
    );
  }

  const baseUrl = normalizeBaseUrl(customBaseUrl || env.baseUrl);
  const model = customModel || env.model;
  const source: 'env' | 'custom' =
    customApiKey || customBaseUrl ? 'custom' : 'env';

  return { baseUrl, apiKey, model, source };
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if ((error as { name?: string }).name === 'AbortError') {
      throw new AiServiceError('TIMEOUT', '请求 AI 接口超时，请稍后重试');
    }
    throw new AiServiceError(
      'UPSTREAM_ERROR',
      '无法连接到 AI 接口地址，请检查 Base URL 与网络连通性',
    );
  } finally {
    clearTimeout(timer);
  }
}

async function extractUpstreamErrorMessage(res: Response): Promise<string> {
  const fallback = `AI 接口返回异常状态码（HTTP ${res.status}）`;
  const text = await res.text().catch(() => '');
  if (!text) {
    return fallback;
  }

  try {
    const json = JSON.parse(text) as {
      error?: { message?: unknown } | string;
      message?: unknown;
    };
    if (typeof json.error === 'string' && json.error.trim()) {
      return `${fallback}：${json.error.trim()}`;
    }
    if (
      json.error &&
      typeof json.error === 'object' &&
      typeof json.error.message === 'string' &&
      json.error.message.trim()
    ) {
      return `${fallback}：${json.error.message.trim()}`;
    }
    if (typeof json.message === 'string' && json.message.trim()) {
      return `${fallback}：${json.message.trim()}`;
    }
  } catch {
    // Plain text response fallback below.
  }

  const snippet = text.trim().slice(0, 140);
  return snippet ? `${fallback}：${snippet}` : fallback;
}

export async function fetchAvailableModels(
  override?: AiModelsRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<AiModelsResponse> {
  const { baseUrl, apiKey, source } = resolveCredentials(override);

  const response = await fetchWithTimeout(
    fetchImpl,
    `${baseUrl}/models`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
    },
    MODELS_TIMEOUT_MS,
  );

  if (!response.ok) {
    throw new AiServiceError(
      'UPSTREAM_ERROR',
      await extractUpstreamErrorMessage(response),
    );
  }

  const payload = (await response.json().catch(() => null)) as {
    data?: Array<{ id?: unknown }>;
    models?: Array<string | { id?: unknown; name?: unknown }>;
  } | null;

  const modelSet = new Set<string>();
  if (Array.isArray(payload?.data)) {
    for (const item of payload.data) {
      if (typeof item?.id === 'string' && item.id.trim()) {
        modelSet.add(item.id.trim());
      }
    }
  } else if (Array.isArray(payload?.models)) {
    for (const item of payload.models) {
      if (typeof item === 'string' && item.trim()) {
        modelSet.add(item.trim());
      } else if (item && typeof item === 'object') {
        const candidate =
          typeof item.id === 'string'
            ? item.id
            : typeof item.name === 'string'
              ? item.name
              : '';
        if (candidate.trim()) {
          modelSet.add(candidate.trim());
        }
      }
    }
  }

  const models = Array.from(modelSet).sort((a, b) => a.localeCompare(b));
  return { models, source };
}

function buildAdvicePrompt(report: ScanReport): {
  system: string;
  user: string;
} {
  const condensedReport = {
    repo: {
      platform: report.repo.platform,
      owner: report.repo.owner,
      repo: report.repo.repo,
      branch: report.repo.scannedBranch,
      commitShortSha: report.repo.commitShortSha,
      scannedFiles: report.repo.scannedFiles,
    },
    staticScore: report.totalScore,
    readinessLevel: report.readinessLevel,
    hasBlockingRisk: report.hasBlockingRisk,
    dimensions: report.dimensions.map((d) => ({
      id: d.id,
      name: d.name,
      score: d.score,
      maxScore: d.maxScore,
      issueCount: d.issueCount,
      highRiskCount: d.highRiskCount,
      summary: d.summary,
    })),
    risks: report.risks.slice(0, 30).map((r) => ({
      dimension: r.dimension,
      severity: r.severity,
      ruleId: r.ruleId,
      title: r.title,
      filePath: r.filePath,
      line: r.line,
      snippet: r.snippet,
    })),
  };

  const system = [
    '你是资深软件工程与开源项目接入评估专家。',
    '请根据用户提供的 Git 仓库静态体检报告，给出一份面向研发与接入团队的中文改进建议报告。',
    '要求：',
    '1. 必须严格输出合法 JSON 对象，不要包含额外解释文本。',
    '2. 给出独立的 aiScore（0-100 整数）以及一句话大白话总结 overview。',
    '3. items 必须给出 3 到 5 条最值得优先处理的建议（若仓库本身已非常完善，也可给出 3 条巩固或工程化提升建议），并按风险优先级从高到低排序。',
    '4. 每条建议的 summary 必须是大白话（1-2 句、通俗易懂，不要堆砌术语）；detail 里给出可落地的详细报告。',
    'JSON Schema:',
    JSON.stringify({
      aiScore: 85,
      overview: '一句话总结当前仓库接入难易度与最核心风险',
      items: [
        {
          title: '简短明确的建议标题',
          severity: 'high | medium | low',
          summary: '1-2 句大白话摘要，说明影响和要做什么',
          detail: {
            whyItMatters: '详细说明为什么该问题会影响项目接入、部署或安全性',
            relatedFiles: ['相关文件路径（无则传空数组）'],
            actionSteps: ['具体改造步骤 1', '具体改造步骤 2'],
            expectedImpact: '整改完成后的预期收益',
          },
        },
      ],
    }),
  ].join('\n');

  const user = `以下是仓库静态体检结果（敏感片段已脱敏），请生成 AI 评估与整改建议：\n${JSON.stringify(condensedReport)}`;

  return { system, user };
}

function extractJsonObject(rawContent: string): unknown {
  const trimmed = rawContent.trim();
  const fenceMatch = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(trimmed);
  const candidate = fenceMatch?.[1]?.trim() ?? trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
      } catch {
        // Fall through to error.
      }
    }
  }

  throw new AiServiceError(
    'INVALID_AI_OUTPUT',
    'AI 返回内容不是合法的 JSON 格式，请重试或更换模型',
  );
}

async function requestChatCompletion(
  fetchImpl: typeof fetch,
  baseUrl: string,
  apiKey: string,
  model: string,
  prompt: { system: string; user: string },
  useResponseFormat: boolean,
): Promise<Response> {
  const body: Record<string, unknown> = {
    model,
    temperature: 0.3,
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ],
  };

  if (useResponseFormat) {
    body.response_format = { type: 'json_object' };
  }

  return fetchWithTimeout(
    fetchImpl,
    `${baseUrl}/chat/completions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    },
    ADVICE_TIMEOUT_MS,
  );
}

export async function generateAiAdvice(
  report: ScanReport,
  override?: AiClientConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<AiAdviceReport> {
  const { baseUrl, apiKey, model, source } = resolveCredentials(override);

  if (!model) {
    throw new AiServiceError(
      'MISSING_MODEL',
      '请先选择或手动填写要使用的模型名称',
    );
  }

  const prompt = buildAdvicePrompt(report);

  let response = await requestChatCompletion(
    fetchImpl,
    baseUrl,
    apiKey,
    model,
    prompt,
    true,
  );

  // Some OpenAI-compatible gateways reject response_format=json_object with HTTP 400.
  if (response.status === 400) {
    response = await requestChatCompletion(
      fetchImpl,
      baseUrl,
      apiKey,
      model,
      prompt,
      false,
    );
  }

  if (!response.ok) {
    throw new AiServiceError(
      'UPSTREAM_ERROR',
      await extractUpstreamErrorMessage(response),
    );
  }

  const completionPayload = (await response.json().catch(() => null)) as {
    choices?: Array<{
      message?: { content?: unknown };
    }>;
  } | null;

  const rawContent = completionPayload?.choices?.[0]?.message?.content;
  if (typeof rawContent !== 'string' || !rawContent.trim()) {
    throw new AiServiceError(
      'INVALID_AI_OUTPUT',
      'AI 接口未返回有效内容，请检查模型配置后重试',
    );
  }

  const parsedJson = extractJsonObject(rawContent);
  const validated = aiResponsePayloadSchema.safeParse(parsedJson);
  if (!validated.success) {
    throw new AiServiceError(
      'INVALID_AI_OUTPUT',
      'AI 返回的结构不符合预期格式，请重试或更换能力更强的模型',
    );
  }

  const sortedItems: AiAdviceItem[] = [...validated.data.items]
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    .slice(0, 5)
    .map((item, idx) => ({
      id: `ai-advice-${idx + 1}`,
      title: item.title,
      severity: item.severity,
      summary: item.summary,
      detail: item.detail,
    }));

  const aiScore = Math.max(
    0,
    Math.min(100, Math.round(validated.data.aiScore)),
  );

  return {
    aiScore,
    overview: validated.data.overview,
    items: sortedItems,
    modelUsed: model,
    configSource: source,
    generatedAt: new Date().toISOString(),
  };
}
