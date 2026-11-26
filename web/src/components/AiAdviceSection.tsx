import { useState } from 'react';
import type {
  AiAdviceItem,
  AiAdviceReport,
  AiConfigStatus,
  RiskSeverity,
} from '@repo-checkup/shared';
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Info,
  KeyRound,
  Loader2,
  RefreshCw,
  Settings2,
  Sparkles,
} from 'lucide-react';
import { AiAdviceDrawer } from './AiAdviceDrawer';

export interface AiUiConfigState {
  baseUrl: string;
  apiKey: string;
  model: string;
  availableModels: string[];
  showCustomPanel: boolean;
}

interface AiAdviceSectionProps {
  configStatus: AiConfigStatus | null;
  uiConfig: AiUiConfigState;
  loadingModels: boolean;
  loadingAdvice: boolean;
  notice: string | null;
  aiReport: AiAdviceReport | null;
  onUpdateConfig: (patch: Partial<AiUiConfigState>) => void;
  onFetchModels: () => void;
  onGenerateAdvice: () => void;
}

const PROVIDER_PRESETS = [
  { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1' },
  { label: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1' },
  { label: 'GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
] as const;

const SEVERITY_BADGE: Record<
  RiskSeverity,
  { label: string; className: string; borderClass: string }
> = {
  high: {
    label: '高危',
    className: 'border-rose-200 bg-rose-50 text-rose-700',
    borderClass: 'border-t-rose-500',
  },
  medium: {
    label: '中危',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
    borderClass: 'border-t-amber-500',
  },
  low: {
    label: '低危',
    className: 'border-sky-200 bg-sky-50 text-sky-700',
    borderClass: 'border-t-sky-500',
  },
};

function getAiScoreStyle(score: number): {
  textClass: string;
  badgeClass: string;
  label: string;
} {
  if (score >= 85) {
    return {
      textClass: 'text-emerald-600',
      badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      label: 'AI 评估：推荐接入',
    };
  }
  if (score >= 60) {
    return {
      textClass: 'text-amber-600',
      badgeClass: 'border-amber-200 bg-amber-50 text-amber-700',
      label: 'AI 评估：建议微调后接入',
    };
  }
  return {
    textClass: 'text-rose-600',
    badgeClass: 'border-rose-200 bg-rose-50 text-rose-700',
    label: 'AI 评估：建议先重点整改',
  };
}

export function AiAdviceSection({
  configStatus,
  uiConfig,
  loadingModels,
  loadingAdvice,
  notice,
  aiReport,
  onUpdateConfig,
  onFetchModels,
  onGenerateAdvice,
}: AiAdviceSectionProps) {
  const [selectedItem, setSelectedItem] = useState<AiAdviceItem | null>(null);

  const hasEnvKey = Boolean(configStatus?.hasEnvConfig);
  const hasCustomKey = Boolean(uiConfig.apiKey.trim());
  const hasAnyKey = hasEnvKey || hasCustomKey;
  const effectiveModel =
    uiConfig.model.trim() || configStatus?.defaultModel || '';

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-lg bg-violet-50 p-1.5 text-violet-600">
              <Sparkles className="h-4 w-4" />
            </div>
            <h2 className="text-base font-semibold text-slate-900">
              AI 智能接入建议
            </h2>
            {hasEnvKey && !hasCustomKey && (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                已读取本地 .env 配置
              </span>
            )}
            {hasCustomKey && (
              <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                使用页面自定义 Key
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500">
            按需手动触发，基于本次体检结果生成独立 AI 评分与优先级整改建议，不影响上方静态扫描流程。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              onUpdateConfig({ showCustomPanel: !uiConfig.showCustomPanel })
            }
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
          >
            <Settings2 className="h-3.5 w-3.5" />
            接口与模型设置
            {uiConfig.showCustomPanel ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>

          <button
            type="button"
            disabled={loadingAdvice}
            onClick={onGenerateAdvice}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-xs transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
          >
            {loadingAdvice ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                正在生成建议...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                {aiReport ? '重新生成 AI 建议' : '生成 AI 建议'}
              </>
            )}
          </button>
        </div>
      </div>

      {!hasAnyKey && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs leading-relaxed text-amber-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <span className="font-medium">尚未配置 AI API Key：</span>
            不影响仓库静态扫描与报告查看。你可以在项目根目录{' '}
            <code className="rounded bg-amber-100/80 px-1 py-0.5 font-mono text-[11px]">
              .env
            </code>{' '}
            配置{' '}
            <code className="rounded bg-amber-100/80 px-1 py-0.5 font-mono text-[11px]">
              AI_API_KEY
            </code>
            ，或直接在下方填写兼容 OpenAI 的 Base URL 与 API Key 后点击生成。
          </div>
        </div>
      )}

      {uiConfig.showCustomPanel && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-medium text-slate-700">
                  Base URL（OpenAI 兼容接口）
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {PROVIDER_PRESETS.map((preset) => {
                    const active = uiConfig.baseUrl.trim() === preset.baseUrl;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() =>
                          onUpdateConfig({
                            baseUrl: preset.baseUrl,
                            availableModels: [],
                          })
                        }
                        className={`rounded-md border px-2 py-0.5 text-[11px] font-medium transition ${
                          active
                            ? 'border-violet-500 bg-violet-50 text-violet-700'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:text-violet-700'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <input
                type="url"
                value={uiConfig.baseUrl}
                onChange={(event) =>
                  onUpdateConfig({ baseUrl: event.target.value })
                }
                placeholder={
                  configStatus?.defaultBaseUrl ??
                  '请输入或点击上方快捷填入厂商 Base URL'
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                API Key{hasEnvKey ? '（留空则优先使用本地 .env）' : ''}
              </label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  value={uiConfig.apiKey}
                  onChange={(event) =>
                    onUpdateConfig({ apiKey: event.target.value })
                  }
                  placeholder={
                    hasEnvKey
                      ? '已配置本地 .env Key，如需覆盖可在此填写'
                      : 'sk-...'
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-8 text-xs text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                />
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1">
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-medium text-slate-700">
                  选择或手动填写模型名称
                </label>
                {uiConfig.availableModels.length > 0 && (
                  <span className="text-[11px] text-emerald-600">
                    已拉取 {uiConfig.availableModels.length} 个模型
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                {uiConfig.availableModels.length > 0 && (
                  <select
                    value={
                      uiConfig.availableModels.includes(effectiveModel)
                        ? effectiveModel
                        : ''
                    }
                    onChange={(event) => {
                      if (event.target.value) {
                        onUpdateConfig({ model: event.target.value });
                      }
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 outline-none focus:border-violet-500 sm:max-w-[220px]"
                  >
                    <option value="">从列表选择模型...</option>
                    {uiConfig.availableModels.map((modelId) => (
                      <option key={modelId} value={modelId}>
                        {modelId}
                      </option>
                    ))}
                  </select>
                )}

                <input
                  type="text"
                  value={uiConfig.model}
                  onChange={(event) =>
                    onUpdateConfig({ model: event.target.value })
                  }
                  placeholder={
                    configStatus?.defaultModel
                      ? `默认：${configStatus.defaultModel}（可直接修改或手填）`
                      : '手动输入模型名称，例如 gpt-4o-mini / deepseek-chat'
                  }
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                />
              </div>
            </div>

            <button
              type="button"
              disabled={loadingModels || loadingAdvice}
              onClick={onFetchModels}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingModels ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  拉取中...
                </>
              ) : (
                <>
                  <RefreshCw className="h-3.5 w-3.5" />
                  拉取可用 Model 列表
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {notice && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <span>{notice}</span>
        </div>
      )}

      {aiReport && (
        <div className="mt-5 space-y-4 border-t border-slate-100 pt-5">
          {/* AI Score Header */}
          <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-2xs">
                <span
                  className={`text-2xl font-bold leading-none ${getAiScoreStyle(aiReport.aiScore).textClass}`}
                >
                  {aiReport.aiScore}
                </span>
                <span className="mt-1 text-[10px] text-slate-400">
                  AI 评分
                </span>
              </div>

              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getAiScoreStyle(aiReport.aiScore).badgeClass}`}
                  >
                    {getAiScoreStyle(aiReport.aiScore).label}
                  </span>
                  <span className="rounded-md bg-slate-200/70 px-2 py-0.5 font-mono text-[11px] text-slate-600">
                    {aiReport.modelUsed}
                  </span>
                </div>
                <p className="text-sm text-slate-700">{aiReport.overview}</p>
              </div>
            </div>
          </div>

          {/* 3-5 Priority-Sorted Cards (Title + Severity + Plain Summary only) */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {aiReport.items.map((item) => {
              const sev = SEVERITY_BADGE[item.severity];
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedItem(item)}
                  className={`group flex flex-col justify-between rounded-xl border border-slate-200 border-t-4 ${sev.borderClass} bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-sm`}
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${sev.className}`}
                      >
                        {sev.label}
                      </span>
                      <ChevronRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-violet-500" />
                    </div>

                    <h3 className="text-sm font-semibold leading-snug text-slate-900">
                      {item.title}
                    </h3>

                    <p className="text-xs leading-relaxed text-slate-600">
                      {item.summary}
                    </p>
                  </div>

                  <span className="mt-3 text-[11px] font-medium text-violet-600 opacity-80 group-hover:opacity-100">
                    点击查看详细报告
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <AiAdviceDrawer item={selectedItem} onClose={() => setSelectedItem(null)} />
    </section>
  );
}
