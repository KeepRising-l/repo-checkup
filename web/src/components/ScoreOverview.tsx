import { useState } from 'react';
import type {
  CheckDimensionId,
  CompletenessDetails,
  DimensionSummary,
  GitPlatform,
  ReadinessLevel,
  ScanReport,
} from '@repo-checkup/shared';
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCode2,
  GitBranch,
  GitCommitHorizontal,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { HexRadarChart, type RadarAxisItem } from './HexRadarChart';

interface ScoreOverviewProps {
  report: ScanReport;
  selectedDimension: CheckDimensionId | 'all';
  onSelectDimension: (dimension: CheckDimensionId | 'all') => void;
}

const PLATFORM_BADGE: Record<GitPlatform, string> = {
  github: 'GitHub',
  gitcode: 'GitCode',
  gitee: 'Gitee',
};

const READINESS_META: Record<
  ReadinessLevel,
  {
    label: string;
    badgeClass: string;
  }
> = {
  ready: {
    label: '可直接接入',
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  needs_work: {
    label: '建议整改后接入',
    badgeClass: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  high_risk: {
    label: '存在高危阻塞',
    badgeClass: 'border-rose-200 bg-rose-50 text-rose-700',
  },
};

function formatDateTime(iso?: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toStatus(
  scorePercent: number,
  highRiskCount: number,
): RadarAxisItem['status'] {
  if (highRiskCount > 0 || scorePercent < 50) return 'risk';
  if (scorePercent < 90) return 'warn';
  return 'ok';
}

function buildRadarAxes(report: ScanReport): {
  axes: RadarAxisItem[];
  completenessDetails?: CompletenessDetails;
} {
  const byId = new Map<CheckDimensionId, DimensionSummary>(
    report.dimensions.map((d) => [d.id, d]),
  );

  const comp = byId.get('completeness');
  const win = byId.get('windows_scripts');
  const paths = byId.get('hardcoded_paths');
  const secrets = byId.get('secrets');

  const compPct = comp?.maxScore
    ? Math.round((comp.score / comp.maxScore) * 100)
    : 100;
  const winPct = win?.maxScore
    ? Math.round((win.score / win.maxScore) * 100)
    : 100;
  const pathsPct = paths?.maxScore
    ? Math.round((paths.score / paths.maxScore) * 100)
    : 100;
  const secretsPct = secrets?.maxScore
    ? Math.round((secrets.score / secrets.maxScore) * 100)
    : 100;

  const highCount = report.risks.filter((r) => r.severity === 'high').length;
  const medCount = report.risks.filter((r) => r.severity === 'medium').length;
  const lowCount = report.risks.filter((r) => r.severity === 'low').length;

  const controllabilityPct = report.hasBlockingRisk
    ? Math.max(10, 45 - highCount * 10)
    : Math.max(0, 100 - highCount * 25 - medCount * 5 - lowCount * 2);

  const controllabilityNote =
    report.risks.length === 0
      ? '0 项风险，无需额外排查'
      : `高危 ${highCount} · 中危 ${medCount} · 低危 ${lowCount}`;

  const readinessNote =
    report.readinessLevel === 'ready'
      ? '工程规范达标，可直接拉取接入'
      : report.readinessLevel === 'needs_work'
        ? '主体结构良好，解决兼容风险即可接入'
        : '存在高危阻塞项，建议整改后再接入';

  const axes: RadarAxisItem[] = [
    {
      key: 'completeness',
      label: '工程完整度',
      scorePercent: compPct,
      rawLabel: `${comp?.score ?? 25} / ${comp?.maxScore ?? 25}`,
      note: comp?.summary ?? '基础工程文件齐全',
      status: toStatus(compPct, comp?.highRiskCount ?? 0),
      dimensionId: 'completeness',
    },
    {
      key: 'cross_platform',
      label: '跨平台兼容',
      scorePercent: winPct,
      rawLabel: `${win?.score ?? 20} / ${win?.maxScore ?? 20}`,
      note: win?.summary ?? '未检测到 Windows 专用脚本',
      status: toStatus(winPct, win?.highRiskCount ?? 0),
      dimensionId: 'windows_scripts',
    },
    {
      key: 'portability',
      label: '路径可移植',
      scorePercent: pathsPct,
      rawLabel: `${paths?.score ?? 25} / ${paths?.maxScore ?? 25}`,
      note: paths?.summary ?? '未发现硬编码路径',
      status: toStatus(pathsPct, paths?.highRiskCount ?? 0),
      dimensionId: 'hardcoded_paths',
    },
    {
      key: 'secrets',
      label: '密钥安全度',
      scorePercent: secretsPct,
      rawLabel: `${secrets?.score ?? 30} / ${secrets?.maxScore ?? 30}`,
      note: secrets?.summary ?? '未检测到敏感信息泄露',
      status: toStatus(secretsPct, secrets?.highRiskCount ?? 0),
      dimensionId: 'secrets',
    },
    {
      key: 'readiness',
      label: '接入就绪度',
      scorePercent: report.totalScore,
      rawLabel: `${report.totalScore} / 100`,
      note: readinessNote,
      status:
        report.readinessLevel === 'high_risk'
          ? 'risk'
          : report.readinessLevel === 'needs_work'
            ? 'warn'
            : 'ok',
    },
    {
      key: 'controllability',
      label: '风险可控度',
      scorePercent: controllabilityPct,
      rawLabel: `${controllabilityPct} / 100`,
      note: controllabilityNote,
      status: toStatus(controllabilityPct, highCount),
    },
  ];

  const completenessDetails = comp?.details as CompletenessDetails | undefined;
  return { axes, completenessDetails };
}

export function ScoreOverview({
  report,
  selectedDimension,
  onSelectDimension,
}: ScoreOverviewProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const readiness = READINESS_META[report.readinessLevel];
  const { axes, completenessDetails } = buildRadarAxes(report);

  function handleAxisSelect(axis: RadarAxisItem) {
    if (axis.dimensionId) {
      onSelectDimension(
        selectedDimension === axis.dimensionId ? 'all' : axis.dimensionId,
      );
    } else {
      onSelectDimension('all');
    }
  }

  return (
    <section className="space-y-6 animate-enter">
      {report.hasBlockingRisk && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50/90 px-6 py-4 text-rose-900">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
          <div>
            <div className="text-sm font-semibold">
              高危阻塞告警：检测到疑似密钥、私钥或 .env 文件直接入库
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-rose-700">
              已对报告中的敏感片段执行脱敏处理。请优先核实下方风险清单，并及时吊销或轮换凭证。
            </p>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-[#e7e5e4] bg-white p-7 shadow-[0_2px_10px_rgba(28,25,23,0.03)]">
        {/* Top Repo & Score Metadata Strip */}
        <div className="mb-7 flex flex-wrap items-start justify-between gap-6 border-b border-[#e7e5e4] pb-6">
          <div className="min-w-0 space-y-2.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="rounded-md bg-[#1c1917] px-2.5 py-0.5 font-mono text-xs font-medium text-white">
                {PLATFORM_BADGE[report.repo.platform]}
              </span>
              <a
                href={report.repo.webUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-lg font-semibold tracking-tight text-[#1c1917] transition hover:text-[#57534e]"
              >
                {report.repo.owner}/{report.repo.repo}
                <ExternalLink className="h-4 w-4 text-[#a8a29e]" />
              </a>
              <span
                className={`inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-medium ${readiness.badgeClass}`}
              >
                {readiness.label}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e7e5e4] bg-[#fafaf9] px-3 py-1 font-mono text-[#1c1917]">
                <GitBranch className="h-3.5 w-3.5 text-[#78716c]" />
                {report.repo.scannedBranch}
              </span>

              <span
                title={report.repo.commitSha || undefined}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#e7e5e4] bg-[#fafaf9] px-3 py-1 font-mono text-[#57534e]"
              >
                <GitCommitHorizontal className="h-3.5 w-3.5 text-[#78716c]" />
                {report.repo.commitShortSha || 'N/A'}
              </span>

              {report.repo.commitMessage && (
                <span
                  title={report.repo.commitMessage}
                  className="max-w-md truncate rounded-full border border-[#e7e5e4] bg-[#fafaf9] px-3 py-1 text-[#57534e]"
                >
                  {report.repo.commitMessage}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 pt-0.5 text-xs text-[#78716c]">
              <span className="inline-flex items-center gap-1.5">
                <FileCode2 className="h-3.5 w-3.5 text-[#a8a29e]" />
                扫描 {report.repo.scannedFiles} 个文件（跳过{' '}
                {report.repo.skippedFiles} 个）
              </span>
              <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                <Clock className="h-3.5 w-3.5 text-[#a8a29e]" />
                {(report.repo.durationMs / 1000).toFixed(2)}s
              </span>
              {report.repo.commitDate && (
                <span>提交于 {formatDateTime(report.repo.commitDate)}</span>
              )}
              <span>风险总数 {report.risks.length} 项</span>
            </div>
          </div>

          <div className="flex shrink-0 items-baseline gap-2 rounded-2xl border border-[#e7e5e4] bg-[#fafaf9] px-5 py-3.5">
            <span className="font-mono text-4xl font-bold tracking-tight text-[#1c1917] tabular-nums">
              {report.totalScore}
            </span>
            <span className="font-mono text-xs text-[#78716c]">/ 100 就绪度</span>
          </div>
        </div>

        {/* 2-Column Split: Left 6 Conclusions + Right Hexagon SVG Radar */}
        <div className="grid items-center gap-8 lg:grid-cols-12">
          <div className="min-w-0 space-y-2.5 lg:col-span-6">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold tracking-wider text-[#78716c] uppercase">
                六维接入评估结论（悬停联动雷达图 · 点击筛选风险）
              </h3>
              <span className="font-mono text-xs text-[#a8a29e]">6 / 6</span>
            </div>

            {axes.map((item, idx) => {
              const isHovered = activeIndex === idx;
              const isFilterSelected =
                Boolean(item.dimensionId) &&
                selectedDimension === item.dimensionId;
              const dotClass =
                item.status === 'risk'
                  ? 'bg-rose-500'
                  : item.status === 'warn'
                    ? 'bg-amber-500'
                    : 'bg-emerald-500';

              return (
                <button
                  key={item.key}
                  type="button"
                  onMouseEnter={() => setActiveIndex(idx)}
                  onFocus={() => setActiveIndex(idx)}
                  onClick={() => {
                    setActiveIndex(idx);
                    handleAxisSelect(item);
                  }}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition-colors duration-150 ${
                    isFilterSelected
                      ? 'border-[#1c1917] bg-[#f5f5f4] ring-1 ring-[#1c1917]'
                      : isHovered
                        ? 'border-[#1c1917]/60 bg-[#fafaf9]'
                        : 'border-[#e7e5e4] bg-white hover:border-[#d6d3d1] hover:bg-[#fafaf9]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`}
                      />
                      <span className="text-sm font-medium text-[#1c1917]">
                        {item.label}
                      </span>
                      {isFilterSelected && (
                        <span className="rounded-full bg-[#1c1917] px-2 py-0.5 text-[10px] font-medium text-white">
                          已筛选
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 font-mono text-xs font-semibold text-[#1c1917] tabular-nums">
                      {item.rawLabel}
                    </span>
                  </div>

                  <p className="mt-1 pl-4.5 text-xs leading-relaxed text-[#78716c]">
                    {item.note}
                  </p>

                  {item.key === 'completeness' && completenessDetails && (
                    <div className="mt-2 flex flex-wrap gap-1.5 pl-4.5">
                      <StatusPill
                        ok={completenessDetails.hasReadme}
                        label="README"
                      />
                      <StatusPill
                        ok={completenessDetails.hasDependencyManifest}
                        label="依赖清单"
                      />
                      <StatusPill
                        ok={completenessDetails.hasStartupEntry}
                        label="启动入口"
                      />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex min-w-0 flex-col items-center justify-center lg:col-span-6">
            <HexRadarChart
              axes={axes}
              activeIndex={activeIndex}
              onHoverIndex={setActiveIndex}
              onSelectAxis={handleAxisSelect}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
        ok
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-rose-200 bg-rose-50 text-rose-700'
      }`}
    >
      {ok ? (
        <CheckCircle2 className="h-3 w-3" />
      ) : (
        <XCircle className="h-3 w-3" />
      )}
      {label}
    </span>
  );
}
