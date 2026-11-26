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
    badgeClass: 'border-[#e7e5e4] bg-[#f5f5f4] text-[#57534e]',
    borderClass: 'border-l-[#a8a29e]',
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
    <section className="rounded-2xl border border-[#e7e5e4] bg-white p-7 shadow-[0_2px_10px_rgba(28,25,23,0.03)]">
      <div className="flex flex-col gap-4 border-b border-[#e7e5e4] pb-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <FileWarning className="h-4 w-4 text-[#57534e]" />
            <h2 className="text-base font-semibold text-[#1c1917]">
              静态扫描风险清单
            </h2>
            <span className="rounded-full border border-[#e7e5e4] bg-[#fafaf9] px-2.5 py-0.5 font-mono text-xs text-[#57534e] tabular-nums">
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
              className="cursor-pointer text-xs font-medium text-[#1c1917] underline underline-offset-4 hover:text-[#57534e]"
            >
              重置筛选
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Filter className="mr-1 h-3.5 w-3.5 text-[#a8a29e]" />
            {DIMENSION_OPTIONS.map((opt) => {
              const active = selectedDimension === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onSelectDimension(opt.id)}
                  className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition ${
                    active
                      ? 'border-[#1c1917] bg-[#1c1917] text-white'
                      : 'border-[#e7e5e4] bg-[#fafaf9] text-[#57534e] hover:border-[#d6d3d1] hover:text-[#1c1917]'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {SEVERITY_OPTIONS.map((opt) => {
              const active = selectedSeverity === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onSelectSeverity(opt.id)}
                  className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition ${
                    active
                      ? 'border-[#1c1917] bg-[#1c1917] text-white'
                      : 'border-[#e7e5e4] bg-[#fafaf9] text-[#57534e] hover:border-[#d6d3d1] hover:text-[#1c1917]'
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
          <CheckCircle2 className="h-9 w-9 text-emerald-600" />
          <p className="mt-3 text-sm font-medium text-[#1c1917]">
            本次体检未发现静态扫描风险
          </p>
          <p className="mt-1 text-xs text-[#78716c]">
            四大核心维度表现良好，可以直接尝试拉取并启动验证。
          </p>
        </div>
      ) : filteredRisks.length === 0 ? (
        <div className="py-10 text-center text-xs text-[#78716c]">
          当前筛选条件下暂无风险项，可点击右上角「重置筛选」查看全部风险。
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {filteredRisks.map((risk) => {
            const sev = SEVERITY_META[risk.severity];
            return (
              <article
                key={risk.id}
                className={`rounded-xl border border-[#e7e5e4] border-l-4 ${sev.borderClass} bg-[#fafaf9]/70 p-4 transition hover:border-[#d6d3d1] hover:bg-white`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${sev.badgeClass}`}
                  >
                    {sev.label}
                  </span>
                  <span className="rounded-full border border-[#e7e5e4] bg-white px-2.5 py-0.5 text-xs text-[#57534e]">
                    {DIMENSION_LABELS[risk.dimension]}
                  </span>
                  <h3 className="text-sm font-semibold text-[#1c1917]">
                    {risk.title}
                  </h3>
                </div>

                {risk.filePath && (
                  <div className="mt-2 font-mono text-xs text-[#57534e]">
                    {risk.filePath}
                    {risk.line ? `:${risk.line}` : ''}
                  </div>
                )}

                {risk.snippet && (
                  <pre className="mt-2.5 overflow-x-auto rounded-lg bg-[#1c1917] px-3.5 py-2.5 font-mono text-xs text-[#fafaf9]">
                    <code>{risk.snippet}</code>
                  </pre>
                )}

                <p className="mt-2.5 text-xs leading-relaxed text-[#57534e]">
                  <span className="font-semibold text-[#292524]">
                    整改建议：
                  </span>
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
