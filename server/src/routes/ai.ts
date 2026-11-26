import { Hono } from 'hono';
import { z } from 'zod';
import type { ScanErrorResponse, ScanReport } from '@repo-checkup/shared';
import {
  AiServiceError,
  fetchAvailableModels,
  generateAiAdvice,
  getAiConfigStatus,
} from '../services/aiService.js';

const modelsRequestSchema = z
  .object({
    baseUrl: z.string().optional(),
    apiKey: z.string().optional(),
  })
  .optional();

const clientConfigSchema = z
  .object({
    baseUrl: z.string().optional(),
    apiKey: z.string().optional(),
    model: z.string().optional(),
  })
  .optional();

const scanReportSchema = z.object({
  repo: z.object({
    platform: z.enum(['github', 'gitcode', 'gitee']),
    owner: z.string(),
    repo: z.string(),
    cloneUrl: z.string(),
    webUrl: z.string(),
    requestedBranch: z.string().optional(),
    scannedBranch: z.string(),
    commitSha: z.string(),
    commitShortSha: z.string(),
    commitMessage: z.string().optional(),
    commitDate: z.string().optional(),
    scannedFiles: z.number(),
    skippedFiles: z.number(),
    durationMs: z.number(),
  }),
  totalScore: z.number(),
  readinessLevel: z.enum(['ready', 'needs_work', 'high_risk']),
  hasBlockingRisk: z.boolean(),
  dimensions: z.array(
    z.object({
      id: z.enum([
        'completeness',
        'windows_scripts',
        'hardcoded_paths',
        'secrets',
      ]),
      name: z.string(),
      score: z.number(),
      maxScore: z.number(),
      issueCount: z.number(),
      highRiskCount: z.number(),
      summary: z.string(),
      details: z.record(z.unknown()).optional(),
    }),
  ),
  risks: z.array(
    z.object({
      id: z.string(),
      dimension: z.enum([
        'completeness',
        'windows_scripts',
        'hardcoded_paths',
        'secrets',
      ]),
      ruleId: z.string(),
      title: z.string(),
      severity: z.enum(['high', 'medium', 'low']),
      filePath: z.string().optional(),
      line: z.number().optional(),
      snippet: z.string().optional(),
      suggestion: z.string(),
    }),
  ),
  scannedAt: z.string(),
});

const adviceRequestSchema = z.object({
  report: scanReportSchema,
  config: clientConfigSchema,
});

function mapAiErrorStatus(code: AiServiceError['code']): 400 | 502 | 504 {
  switch (code) {
    case 'NO_API_KEY':
    case 'INVALID_BASE_URL':
    case 'MISSING_MODEL':
      return 400;
    case 'TIMEOUT':
      return 504;
    case 'UPSTREAM_ERROR':
    case 'INVALID_AI_OUTPUT':
      return 502;
  }
}

export const aiRoute = new Hono();

aiRoute.get('/config', (c) => {
  return c.json(getAiConfigStatus(), 200);
});

aiRoute.post('/models', async (c) => {
  const body: unknown = await c.req.json().catch(() => ({}));
  const parsed = modelsRequestSchema.safeParse(body ?? {});
  if (!parsed.success) {
    const response: ScanErrorResponse = {
      error: '模型列表请求参数不合法',
      code: 'INVALID_REQUEST',
    };
    return c.json(response, 400);
  }

  try {
    const result = await fetchAvailableModels(parsed.data);
    return c.json(result, 200);
  } catch (error) {
    if (error instanceof AiServiceError) {
      const response: ScanErrorResponse = {
        error: error.message,
        code: error.code,
      };
      return c.json(response, mapAiErrorStatus(error.code));
    }
    const response: ScanErrorResponse = {
      error: '拉取模型列表失败',
      code: 'UPSTREAM_ERROR',
    };
    return c.json(response, 502);
  }
});

aiRoute.post('/advice', async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = adviceRequestSchema.safeParse(body);
  if (!parsed.success) {
    const response: ScanErrorResponse = {
      error: '生成 AI 建议的请求参数不完整或格式不正确',
      code: 'INVALID_REQUEST',
    };
    return c.json(response, 400);
  }

  try {
    const advice = await generateAiAdvice(
      parsed.data.report as ScanReport,
      parsed.data.config,
    );
    return c.json(advice, 200);
  } catch (error) {
    if (error instanceof AiServiceError) {
      const response: ScanErrorResponse = {
        error: error.message,
        code: error.code,
      };
      return c.json(response, mapAiErrorStatus(error.code));
    }
    const response: ScanErrorResponse = {
      error: '生成 AI 建议失败',
      code: 'UPSTREAM_ERROR',
    };
    return c.json(response, 502);
  }
});
