import type {
  CheckDimensionId,
  RiskItem,
  RiskSeverity,
} from '@repo-checkup/shared';
import { CheckCircle2, FileWarning, Filter } from 'lucide-react';

interface RiskListProps {
  risks: RiskItem[];
  selectedDimension: CheckDimensionId | 'all';
  selectedSeverity: RiskSeverity | 'all';
  onSelectDimension: (dimension: CheckDimensionId | 'all') => void;
  onSelectSeverity: (severity: RiskSeverity | 'all') => void;
}

const DIMENSION_LABELS: Record<CheckDimensionId, string> = {
  completeness: '基础完整度',
  windows_scripts: 'Windows 专用脚本',
  hardcoded_paths: '硬编码路径',
  secrets: '密钥与敏感信息',
};

const SEVERITY_META: Record<
  RiskSeverity,
  { label: string; badgeClass: string; borderClass: string }
> = {
  high: {
    label: '高危',
    badgeClass: 'border-rose-200 bg-rose-50 text-rose-700',
    borderClass: 'border-l-rose-500',
  },
  medium: {
    label: '中危',
    badgeClass: 'border-amber-200 bg-amber-50 text-amber-700',
    borderClass: 'border-l-amber-500',
  },
  low: {
    label: '低危',
    badgeClass: 'border-sky-200 bg-sky-50 text-sky-700',
    borderClass: 'border-l-sky-500',
  },
};

const DIMENSION_OPTIONS: Array<{ id: CheckDimensionId | 'all'; label: string }> =
  [
    { id: 'all', label: '全部维度' },
    { id: 'secrets', label: '密钥与敏感信息' },
    { id: 'completeness', label: '基础完整度' },
    { id: 'hardcoded_paths', label: '硬编码路径' },
    { id: 'windows_scripts', label: 'Windows 脚本' },
  ];

const SEVERITY_OPTIONS: Array<{ id: RiskSeverity | 'all'; label: string }> = [
  { id: 'all', label: '全部级别' },
  { id: 'high', label: '高危' },
  { id: 'medium', label: '中危' },
  { id: 'low', label: '低危' },
];

export function RiskList({
  risks,
  selectedDimension,
  selectedSeverity,
  onSelectDimension,
  onSelectSeverity,
}: RiskListProps) {
  const filteredRisks = risks.filter((risk) => {
    if (selectedDimension !== 'all' && risk.dimension !== selectedDimension) {
      return false;
    }
    if (selectedSeverity !== 'all' && risk.severity !== selectedSeverity) {
      return false;
    }
    return true;
  });

  const severityCounts: Record<RiskSeverity | 'all', number> = {
    all: risks.length,
    high: risks.filter((r) => r.severity === 'high').length,
    medium: risks.filter((r) => r.severity === 'medium').length,
    low: risks.filter((r) => r.severity === 'low').length,
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileWarning className="h-5 w-5 text-slate-700" />
            <h2 className="text-base font-semibold text-slate-900">
              主要风险清单
            </h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              {filteredRisks.length} / {risks.length}
            </span>
          </div>

          {(selectedDimension !== 'all' || selectedSeverity !== 'all') && (
            <button
              type="button"
              onClick={() => {
                onSelectDimension('all');
                onSelectSeverity('all');
              }}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
            >
              重置筛选
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Dimension Filter */}
          <div className="flex flex-wrap items-center gap-1.5">
            <Filter className="mr-1 h-3.5 w-3.5 text-slate-400" />
            {DIMENSION_OPTIONS.map((opt) => {
              const active = selectedDimension === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onSelectDimension(opt.id)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                    active
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Severity Filter */}
          <div className="flex flex-wrap items-center gap-1.5">
            {SEVERITY_OPTIONS.map((opt) => {
              const active = selectedSeverity === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onSelectSeverity(opt.id)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                    active
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {opt.label} ({severityCounts[opt.id]})
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {risks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          <p className="mt-3 text-sm font-medium text-slate-900">
            太棒了！本次体检未发现明显接入风险
          </p>
          <p className="mt-1 text-xs text-slate-500">
            四大核心维度均表现良好，可以直接尝试拉取并启动验证。
          </p>
        </div>
      ) : filteredRisks.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-500">
          当前筛选条件下暂无风险项，可点击上方「重置筛选」查看全部风险。
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {filteredRisks.map((risk) => {
            const sev = SEVERITY_META[risk.severity];
            return (
              <article
                key={risk.id}
                className={`rounded-xl border border-slate-200 border-l-4 ${sev.borderClass} bg-slate-50/50 p-4`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${sev.badgeClass}`}
                  >
                    {sev.label}
                  </span>
                  <span className="rounded-md bg-slate-200/70 px-2 py-0.5 text-xs font-medium text-slate-700">
                    {DIMENSION_LABELS[risk.dimension]}
                  </span>
                  <h3 className="text-sm font-semibold text-slate-900">
                    {risk.title}
                  </h3>
                </div>

                {risk.filePath && (
                  <div className="mt-2 font-mono text-xs text-slate-600">
                    文件位置：{risk.filePath}
                    {risk.line ? `:${risk.line}` : ''}
                  </div>
                )}

                {risk.snippet && (
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100">
                    <code>{risk.snippet}</code>
                  </pre>
                )}

                <p className="mt-2.5 text-xs leading-relaxed text-slate-600">
                  <span className="font-medium text-slate-700">整改建议：</span>
                  {risk.suggestion}
                </p>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
