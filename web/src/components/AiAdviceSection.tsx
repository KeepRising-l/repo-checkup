import { useState } from 'react';
import type {
  AiAdviceItem,
  AiAdviceReport,
  AiConfigStatus,
  RiskSeverity,
} from '@repo-checkup/shared';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Info,
  KeyRound,
  Loader2,
  RefreshCw,
  Save,
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
  savingConfig: boolean;
  saveSuccess: string | null;
  notice: string | null;
  aiReport: AiAdviceReport | null;
  onUpdateConfig: (patch: Partial<AiUiConfigState>) => void;
  onFetchModels: () => void;
  onSaveConfig: () => void;
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
    className: 'border-[#e7e5e4] bg-[#f5f5f4] text-[#57534e]',
    borderClass: 'border-t-[#78716c]',
  },
};

function getAiScoreBadge(score: number): {
  badgeClass: string;
  label: string;
} {
  if (score >= 85) {
    return {
      badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      label: 'AI 评估：推荐接入',
    };
  }
  if (score >= 60) {
    return {
      badgeClass: 'border-amber-200 bg-amber-50 text-amber-700',
      label: 'AI 评估：建议微调后接入',
    };
  }
  return {
    badgeClass: 'border-rose-200 bg-rose-50 text-rose-700',
    label: 'AI 评估：建议先重点整改',
  };
}

export function AiAdviceSection({
  configStatus,
  uiConfig,
  loadingModels,
  loadingAdvice,
  savingConfig,
  saveSuccess,
  notice,
  aiReport,
  onUpdateConfig,
  onFetchModels,
  onSaveConfig,
  onGenerateAdvice,
}: AiAdviceSectionProps) {
  const [selectedItem, setSelectedItem] = useState<AiAdviceItem | null>(null);

  const hasEnvKey = Boolean(configStatus?.hasEnvConfig);
  const hasCustomKey = Boolean(uiConfig.apiKey.trim());
  const hasAnyKey = hasEnvKey || hasCustomKey;
  const effectiveModel =
    uiConfig.model.trim() || configStatus?.defaultModel || '';
  const hasContentBelowHeader =
    !hasAnyKey ||
    uiConfig.showCustomPanel ||
    Boolean(saveSuccess) ||
    Boolean(notice) ||
    Boolean(aiReport);

  return (
    <section className="rounded-2xl border border-[#e7e5e4] bg-white p-7 shadow-[0_2px_10px_rgba(28,25,23,0.03)]">
      {/* Header Row */}
      <div
        className={`flex flex-wrap items-start justify-between gap-4 ${
          hasContentBelowHeader ? 'border-b border-[#e7e5e4] pb-6' : ''
        }`}
      >
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-base font-semibold text-[#1c1917]">
              AI 智能接入建议
            </h2>
            <span className="rounded-full border border-[#e7e5e4] bg-[#fafaf9] px-2.5 py-0.5 text-xs text-[#78716c]">
              手动触发 · 独立评估
            </span>
            {hasEnvKey && !hasCustomKey && (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                已读取本地 .env
              </span>
            )}
            {hasCustomKey && (
              <span className="rounded-full border border-[#d6d3d1] bg-[#f5f5f4] px-2.5 py-0.5 text-xs font-medium text-[#1c1917]">
                使用页面自定义 Key
              </span>
            )}
            {effectiveModel && (
              <span className="rounded-full border border-[#e7e5e4] bg-[#fafaf9] px-2.5 py-0.5 font-mono text-[11px] text-[#57534e]">
                {effectiveModel}
              </span>
            )}
          </div>
          <p className="text-xs leading-relaxed text-[#78716c]">
            按需生成独立 AI 评分与优先级整改建议，不占用主扫描链路耗时。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() =>
              onUpdateConfig({ showCustomPanel: !uiConfig.showCustomPanel })
            }
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[#d6d3d1] bg-white px-4 py-2 text-xs font-medium text-[#292524] transition hover:bg-[#f5f5f4]"
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
            className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-[#1c1917] px-5 py-2 text-xs font-medium text-white shadow-xs transition hover:bg-[#292524] disabled:cursor-not-allowed disabled:bg-[#d6d3d1] disabled:text-[#78716c]"
          >
            {loadingAdvice ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                正在生成建议...
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                {aiReport ? '重新生成 AI 建议' : '生成 AI 建议'}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Gentle non-blocking prompt when no key */}
      {!hasAnyKey && (
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-[#e7e5e4] bg-[#f5f5f4]/80 px-4 py-3.5 text-xs leading-relaxed text-[#57534e]">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#78716c]" />
          <div>
            <span className="font-semibold text-[#1c1917]">
              尚未配置 AI API Key：
            </span>
            不影响静态扫描与报告查看。你可以在项目根目录{' '}
            <code className="rounded border border-[#e7e5e4] bg-white px-1.5 py-0.5 font-mono text-[11px] text-[#1c1917]">
              .env
            </code>{' '}
            配置{' '}
            <code className="rounded border border-[#e7e5e4] bg-white px-1.5 py-0.5 font-mono text-[11px] text-[#1c1917]">
              AI_API_KEY
            </code>
            ，或直接在下方快捷选择厂商并填写 API Key 后点击生成。
          </div>
        </div>
      )}

      {/* Collapsible Provider & Model Config Panel */}
      {uiConfig.showCustomPanel && (
        <div className="mt-6 space-y-5 rounded-xl border border-[#e7e5e4] bg-[#f5f5f4]/70 p-5 animate-enter">
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-medium text-[#292524]">
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
                        className={`cursor-pointer rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition ${
                          active
                            ? 'border-[#1c1917] bg-[#1c1917] text-white'
                            : 'border-[#d6d3d1] bg-white text-[#57534e] hover:border-[#1c1917] hover:text-[#1c1917]'
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
                className="w-full rounded-xl border border-[#d6d3d1] bg-white px-3.5 py-2.5 text-xs text-[#1c1917] transition outline-none placeholder:text-[#a8a29e] focus:border-[#1c1917] focus:ring-2 focus:ring-[#1c1917]/10"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-medium text-[#292524]">
                API Key{hasEnvKey ? '（留空则优先使用本地 .env）' : ''}
              </label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute top-1/2 left-3.5 h-3.5 w-3.5 -translate-y-1/2 text-[#a8a29e]" />
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
                  className="w-full rounded-xl border border-[#d6d3d1] bg-white py-2.5 pr-3.5 pl-9 text-xs text-[#1c1917] transition outline-none placeholder:text-[#a8a29e] focus:border-[#1c1917] focus:ring-2 focus:ring-[#1c1917]/10"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1">
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-medium text-[#292524]">
                  选择或手动填写模型名称
                </label>
                {uiConfig.availableModels.length > 0 && (
                  <span className="font-mono text-[11px] text-emerald-700">
                    已拉取 {uiConfig.availableModels.length} 个模型
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-2.5 sm:flex-row">
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
                    className="rounded-xl border border-[#d6d3d1] bg-white px-3 py-2.5 text-xs text-[#1c1917] outline-none focus:border-[#1c1917] sm:max-w-[230px]"
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
                      : '手动输入模型名称，例如 deepseek-chat / moonshot-v1-8k'
                  }
                  className="flex-1 rounded-xl border border-[#d6d3d1] bg-white px-3.5 py-2.5 font-mono text-xs text-[#1c1917] transition outline-none placeholder:font-sans placeholder:text-[#a8a29e] focus:border-[#1c1917] focus:ring-2 focus:ring-[#1c1917]/10"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={loadingModels || loadingAdvice || savingConfig}
                onClick={onFetchModels}
                className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-[#d6d3d1] bg-white px-4 py-2.5 text-xs font-medium text-[#292524] transition hover:border-[#1c1917] hover:bg-[#fafaf9] disabled:cursor-not-allowed disabled:opacity-50"
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

              <button
                type="button"
                disabled={savingConfig || loadingAdvice}
                onClick={onSaveConfig}
                className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-[#1c1917] px-4 py-2.5 text-xs font-medium text-white shadow-xs transition hover:bg-[#292524] disabled:cursor-not-allowed disabled:bg-[#d6d3d1] disabled:text-[#78716c]"
              >
                {savingConfig ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    保存中...
                  </>
                ) : (
                  <>
                    <Save className="h-3.5 w-3.5" />
                    保存到本地 .env
                  </>
                )}
              </button>
            </div>
          </div>

        </div>
      )}

      {saveSuccess && (
        <div className="mt-5 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-2.5 text-xs text-emerald-800 animate-enter">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{saveSuccess}</span>
        </div>
      )}

      {notice && (
        <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800 animate-enter">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <span>{notice}</span>
        </div>
      )}

      {/* AI Generated Result */}
      {aiReport && (
        <div className="mt-7 space-y-6 border-t border-[#e7e5e4] pt-7 animate-enter">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#e7e5e4] bg-[#f5f5f4]/70 p-5">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-[#1c1917] text-white shadow-xs">
                <span className="font-mono text-2xl font-bold leading-none tabular-nums">
                  {aiReport.aiScore}
                </span>
                <span className="mt-1 text-[10px] text-[#a8a29e]">
                  AI 评分
                </span>
              </div>

              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${getAiScoreBadge(aiReport.aiScore).badgeClass}`}
                  >
                    {getAiScoreBadge(aiReport.aiScore).label}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-[#292524]">
                  {aiReport.overview}
                </p>
              </div>
            </div>

            <span className="rounded-full border border-[#e7e5e4] bg-white px-3 py-1 font-mono text-xs text-[#78716c]">
              {aiReport.modelUsed}
            </span>
          </div>

          {/* 3-5 Minimalist Cards (Title + Severity Badge + Plain Summary ONLY) */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {aiReport.items.map((item) => {
              const sev = SEVERITY_BADGE[item.severity];
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedItem(item)}
                  className={`group flex cursor-pointer flex-col justify-between rounded-2xl border border-[#e7e5e4] border-t-4 ${sev.borderClass} bg-white p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-[#1c1917] hover:shadow-md`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${sev.className}`}
                      >
                        {sev.label}
                      </span>
                      <ChevronRight className="h-4 w-4 text-[#a8a29e] transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-[#1c1917]" />
                    </div>

                    <h3 className="text-sm font-semibold leading-snug text-[#1c1917]">
                      {item.title}
                    </h3>

                    <p className="text-xs leading-relaxed text-[#78716c]">
                      {item.summary}
                    </p>
                  </div>

                  <span className="mt-4 text-[11px] font-medium text-[#57534e] transition-colors group-hover:text-[#1c1917]">
                    查看详细报告 →
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
