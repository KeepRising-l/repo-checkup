import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ScanReport } from '@repo-checkup/shared';
import {
  AiServiceError,
  fetchAvailableModels,
  generateAiAdvice,
  getAiConfigStatus,
  normalizeBaseUrl,
  saveAiConfig,
} from './aiService.js';
import { parseEnvContent } from './envLoader.js';

const sampleReport: ScanReport = {
  repo: {
    platform: 'github',
    owner: 'demo',
    repo: 'sample-app',
    cloneUrl: 'https://github.com/demo/sample-app.git',
    webUrl: 'https://github.com/demo/sample-app',
    scannedBranch: 'main',
    commitSha: '1234567890abcdef1234567890abcdef12345678',
    commitShortSha: '1234567',
    scannedFiles: 25,
    skippedFiles: 1,
    durationMs: 900,
  },
  totalScore: 68,
  readinessLevel: 'needs_work',
  hasBlockingRisk: false,
  dimensions: [
    {
      id: 'completeness',
      name: '基础完整度',
      score: 25,
      maxScore: 25,
      issueCount: 0,
      highRiskCount: 0,
      summary: 'README、依赖清单与启动入口均已具备',
    },
    {
      id: 'windows_scripts',
      name: 'Windows 专用脚本',
      score: 8,
      maxScore: 20,
      issueCount: 2,
      highRiskCount: 0,
      summary: '共发现 2 个 Windows 脚本文件',
    },
    {
      id: 'hardcoded_paths',
      name: '硬编码路径',
      score: 20,
      maxScore: 25,
      issueCount: 1,
      highRiskCount: 0,
      summary: '在 1 个源码文件中发现 1 处硬编码路径',
    },
    {
      id: 'secrets',
      name: '密钥与敏感信息风险',
      score: 15,
      maxScore: 30,
      issueCount: 1,
      highRiskCount: 0,
      summary: '在测试文件中发现 1 项疑似密钥（请人工核实）',
    },
  ],
  risks: [
    {
      id: 'r1',
      dimension: 'windows_scripts',
      ruleId: 'WINDOWS_ONLY_SCRIPT',
      title: '检测到 Windows 专用脚本（.ps1）',
      severity: 'medium',
      filePath: 'scripts/start.ps1',
      suggestion: '补充 shell 脚本',
    },
  ],
  scannedAt: '2026-11-26T00:00:00.000Z',
};

describe('envLoader & aiService', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('parses .env content with quotes and comments', () => {
    const parsed = parseEnvContent(`
      # comment
      AI_BASE_URL="https://example.com/v1"
      AI_API_KEY='test-key-value'
      export AI_MODEL=gpt-4o-mini
    `);
    expect(parsed).toEqual({
      AI_BASE_URL: 'https://example.com/v1',
      AI_API_KEY: 'test-key-value',
      AI_MODEL: 'gpt-4o-mini',
    });
  });

  it('normalizes Base URL and strips trailing endpoints', () => {
    expect(normalizeBaseUrl('https://api.openai.com/v1/')).toBe(
      'https://api.openai.com/v1',
    );
    expect(normalizeBaseUrl('https://api.example.com/v1/chat/completions')).toBe(
      'https://api.example.com/v1',
    );
    expect(normalizeBaseUrl('https://api.example.com/v1/models')).toBe(
      'https://api.example.com/v1',
    );
    expect(() => normalizeBaseUrl('ftp://api.example.com')).toThrowError(
      AiServiceError,
    );
  });

  it('never leaks apiKey in getAiConfigStatus and throws NO_API_KEY when unconfigured', async () => {
    delete process.env.AI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.AI_BASE_URL = 'https://proxy.example.com/v1';
    process.env.AI_MODEL = 'gpt-4o-mini';

    expect(getAiConfigStatus()).toEqual({
      hasEnvConfig: false,
      defaultBaseUrl: 'https://proxy.example.com/v1',
      defaultModel: 'gpt-4o-mini',
    });

    await expect(fetchAvailableModels()).rejects.toMatchObject({
      code: 'NO_API_KEY',
    });

    process.env.AI_API_KEY = 'env-secret-key';
    const status = getAiConfigStatus();
    expect(status.hasEnvConfig).toBe(true);
    expect(JSON.stringify(status)).not.toContain('env-secret-key');
  });

  it('fetches deduplicated sorted models with env or custom credentials', async () => {
    process.env.AI_API_KEY = 'env-key';
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ id: 'gpt-4o' }, { id: 'deepseek-chat' }, { id: 'gpt-4o' }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const res = await fetchAvailableModels(
      { baseUrl: 'https://custom.ai/v1/', apiKey: 'custom-key' },
      mockFetch,
    );

    expect(res).toEqual({
      models: ['deepseek-chat', 'gpt-4o'],
      source: 'custom',
    });
    expect(mockFetch).toHaveBeenCalledWith(
      'https://custom.ai/v1/models',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer custom-key',
        }),
      }),
    );
  });

  it('parses fenced JSON, retries without response_format on 400, clamps score, and sorts items by severity', async () => {
    delete process.env.AI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const aiPayload = {
      aiScore: 104.7,
      overview: '整体结构不错，但启动脚本依赖 Windows，建议优先补充 Shell 入口。',
      items: [
        {
          title: '补充统一文档说明',
          severity: 'low',
          summary: '把本地启动顺序写进 README，新人接手更省心。',
          detail: {
            whyItMatters: '缺少统一启动文档会拉长团队上手时间。',
            relatedFiles: ['README.md'],
            actionSteps: ['补充环境变量与启动步骤'],
            expectedImpact: '降低沟通成本',
          },
        },
        {
          title: '清理或核实测试密钥',
          severity: 'high',
          summary: '测试文件里疑似放了真实密钥格式，建议核对并换成假占位符。',
          detail: {
            whyItMatters: '避免误将生产凭证留在公开仓库中。',
            relatedFiles: ['src/test/DemoTest.java'],
            actionSteps: ['确认凭证是否有效', '替换为 mock 占位符'],
            expectedImpact: '消除潜在泄露风险',
          },
        },
        {
          title: '补充 Linux/Mac 启动脚本',
          severity: 'medium',
          summary: '现在只有 .ps1 脚本，非 Windows 同学和容器都没法直接跑。',
          detail: {
            whyItMatters: '影响跨平台部署与 CI 自动化。',
            relatedFiles: ['scripts/start.ps1'],
            actionSteps: ['新增 scripts/start.sh'],
            expectedImpact: '支持容器化与跨平台一键启动',
          },
        },
      ],
    };

    const mockFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'response_format unsupported' } }), {
          status: 400,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: `\`\`\`json\n${JSON.stringify(aiPayload)}\n\`\`\``,
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    const advice = await generateAiAdvice(
      sampleReport,
      {
        baseUrl: 'https://compat.example.com/v1',
        apiKey: 'user-api-key',
        model: 'custom-model',
      },
      mockFetch,
    );

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(advice.aiScore).toBe(100);
    expect(advice.modelUsed).toBe('custom-model');
    expect(advice.configSource).toBe('custom');
    expect(advice.items.map((i) => i.severity)).toEqual([
      'high',
      'medium',
      'low',
    ]);
  });

  it('persists AI config to .env while preserving unrelated keys and never exposing apiKey', async () => {
    delete process.env.AI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.AI_BASE_URL;
    delete process.env.AI_MODEL;

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-checkup-env-'));
    const envPath = path.join(tmpDir, '.env');
    await fs.writeFile(envPath, '# local config\nPORT=3001\n', 'utf8');

    try {
      const status1 = saveAiConfig(
        {
          baseUrl: 'https://api.deepseek.com/v1/',
          apiKey: 'sk-saved-secret-key',
          model: 'deepseek-chat',
        },
        envPath,
      );

      expect(status1).toEqual({
        hasEnvConfig: true,
        defaultBaseUrl: 'https://api.deepseek.com/v1',
        defaultModel: 'deepseek-chat',
      });
      expect(JSON.stringify(status1)).not.toContain('sk-saved-secret-key');

      // Updating only model reuses existing saved apiKey & baseUrl.
      const status2 = saveAiConfig({ model: 'deepseek-reasoner' }, envPath);
      expect(status2.defaultModel).toBe('deepseek-reasoner');

      const written = await fs.readFile(envPath, 'utf8');
      expect(written).toContain('# local config');
      expect(written).toContain('PORT=3001');
      expect(written).toContain('AI_BASE_URL=https://api.deepseek.com/v1');
      expect(written).toContain('AI_API_KEY=sk-saved-secret-key');
      expect(written).toContain('AI_MODEL=deepseek-reasoner');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
