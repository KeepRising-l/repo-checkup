import type {
  CheckDimensionId,
  CompletenessDetails,
  GitPlatform,
  ReadinessLevel,
  ScanReport,
} from '@repo-checkup/shared';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCheck2,
  FileCode2,
  FolderSearch,
  GitBranch,
  GitCommitHorizontal,
  KeyRound,
  ShieldAlert,
  TerminalSquare,
  XCircle,
} from 'lucide-react';

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
    description: string;
    stroke: string;
    badgeClass: string;
    scoreTextClass: string;
  }
> = {
  ready: {
    label: '可直接接入',
    description: '仓库基础工程规范良好，未发现阻塞性接入风险。',
    stroke: '#10b981',
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    scoreTextClass: 'text-emerald-600',
  },
  needs_work: {
    label: '建议整改后接入',
    description: '存在部分工程完整度或跨平台兼容性问题，建议排查后接入。',
    stroke: '#f59e0b',
    badgeClass: 'border-amber-200 bg-amber-50 text-amber-700',
    scoreTextClass: 'text-amber-600',
  },
  high_risk: {
    label: '存在高危阻塞',
    description: '检测到敏感凭证泄露或较低的工程就绪度，请先整改后再接入。',
    stroke: '#f43f5e',
    badgeClass: 'border-rose-200 bg-rose-50 text-rose-700',
    scoreTextClass: 'text-rose-600',
  },
};

const DIMENSION_ICONS: Record<CheckDimensionId, typeof FileCheck2> = {
  completeness: FileCheck2,
  windows_scripts: TerminalSquare,
  hardcoded_paths: FolderSearch,
  secrets: KeyRound,
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

function getBarColor(score: number, maxScore: number): string {
  const ratio = maxScore > 0 ? score / maxScore : 0;
  if (ratio >= 0.85) return 'bg-emerald-500';
  if (ratio >= 0.6) return 'bg-amber-500';
  return 'bg-rose-500';
}

export function ScoreOverview({
  report,
  selectedDimension,
  onSelectDimension,
}: ScoreOverviewProps) {
  const readiness = READINESS_META[report.readinessLevel];
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(100, report.totalScore));
  const strokeDashoffset = circumference * (1 - progress / 100);

  return (
    <section className="space-y-5">
      {report.hasBlockingRisk && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-300 bg-rose-50 px-5 py-4 text-rose-900">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
          <div>
            <div className="font-semibold">
              高危阻塞告警：检测到疑似密钥、私钥或 .env 文件直接入库
            </div>
            <p className="mt-0.5 text-sm text-rose-700">
              已对报告中的敏感片段执行脱敏处理。请优先核实下方高危风险项，并及时吊销或轮换凭证。
            </p>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col gap-6 md:flex-row md:items-center">
          {/* Circular Gauge */}
          <div className="flex shrink-0 items-center gap-5">
            <div className="relative h-32 w-32">
              <svg className="h-32 w-32 -rotate-90" viewBox="0 0 128 128">
                <circle
                  cx="64"
                  cy="64"
                  r={radius}
                  fill="none"
                  stroke="#e2e8f0"
                  strokeWidth="10"
                />
                <circle
                  cx="64"
                  cy="64"
                  r={radius}
                  fill="none"
                  stroke={readiness.stroke}
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  className="transition-all duration-500"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span
                  className={`text-3xl font-bold tracking-tight ${readiness.scoreTextClass}`}
                >
                  {report.totalScore}
                </span>
                <span className="text-xs text-slate-400">接入就绪度 / 100</span>
              </div>
            </div>

            <div className="space-y-2 md:hidden">
              <span
                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${readiness.badgeClass}`}
              >
                {readiness.label}
              </span>
              <p className="text-xs text-slate-500">{readiness.description}</p>
            </div>
          </div>

          {/* Repo & Git Snapshot Info */}
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="rounded-md bg-slate-900 px-2.5 py-0.5 text-xs font-medium text-white">
                {PLATFORM_BADGE[report.repo.platform]}
              </span>
              <a
                href={report.repo.webUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-lg font-semibold text-slate-900 hover:text-indigo-600"
              >
                {report.repo.owner}/{report.repo.repo}
                <ExternalLink className="h-4 w-4 text-slate-400" />
              </a>
              <span
                className={`hidden items-center rounded-full border px-3 py-0.5 text-xs font-semibold md:inline-flex ${readiness.badgeClass}`}
              >
                {readiness.label}
              </span>
            </div>

            <p className="hidden text-sm text-slate-600 md:block">
              {readiness.description}
            </p>

            {/* Git Branch & Commit Row */}
            <div className="flex flex-wrap items-center gap-2.5 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 font-medium text-indigo-700">
                <GitBranch className="h-3.5 w-3.5" />
                扫描分支：{report.repo.scannedBranch}
              </span>

              <span
                title={report.repo.commitSha || undefined}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-slate-700"
              >
                <GitCommitHorizontal className="h-3.5 w-3.5 text-slate-500" />
                Commit: {report.repo.commitShortSha || 'N/A'}
              </span>

              {report.repo.commitMessage && (
                <span
                  title={report.repo.commitMessage}
                  className="max-w-md truncate rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600"
                >
                  {report.repo.commitMessage}
                </span>
              )}
            </div>

            {/* Stats Row */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 pt-1 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <FileCode2 className="h-3.5 w-3.5 text-slate-400" />
                扫描文件 {report.repo.scannedFiles} 个（跳过{' '}
                {report.repo.skippedFiles} 个）
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-slate-400" />
                耗时 {(report.repo.durationMs / 1000).toFixed(2)}s
              </span>
              {report.repo.commitDate && (
                <span>最近提交：{formatDateTime(report.repo.commitDate)}</span>
              )}
              <span>风险总数：{report.risks.length} 项</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4 Dimension Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {report.dimensions.map((dim) => {
          const Icon = DIMENSION_ICONS[dim.id];
          const isSelected = selectedDimension === dim.id;
          const completenessDetails =
            dim.id === 'completeness'
              ? (dim.details as CompletenessDetails | undefined)
              : undefined;
          const pct =
            dim.maxScore > 0 ? Math.round((dim.score / dim.maxScore) * 100) : 0;

          return (
            <button
              key={dim.id}
              type="button"
              onClick={() => onSelectDimension(isSelected ? 'all' : dim.id)}
              className={`group rounded-xl border p-4 text-left transition ${
                isSelected
                  ? 'border-indigo-500 bg-indigo-50/40 ring-2 ring-indigo-100'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div
                    className={`rounded-lg p-1.5 ${
                      dim.highRiskCount > 0
                        ? 'bg-rose-50 text-rose-600'
                        : 'bg-indigo-50 text-indigo-600'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-semibold text-slate-900">
                    {dim.name}
                  </span>
                </div>
                <span className="text-sm font-bold text-slate-900">
                  {dim.score}
                  <span className="text-xs font-normal text-slate-400">
                    /{dim.maxScore}
                  </span>
                </span>
              </div>

              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full transition-all ${getBarColor(dim.score, dim.maxScore)}`}
                  style={{ width: `${pct}%` }}
                />
              </div>

              <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-slate-600">
                {dim.summary}
              </p>

              {completenessDetails && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <StatusPill
                    ok={completenessDetails.hasReadme}
                    label="README"
                  />
                  <StatusPill
                    ok={completenessDetails.hasDependencyManifest}
                    label="依赖"
                  />
                  <StatusPill
                    ok={completenessDetails.hasStartupEntry}
                    label="启动入口"
                  />
                </div>
              )}

              {!completenessDetails && (
                <div className="mt-3 flex items-center gap-1.5 text-xs">
                  {dim.issueCount === 0 ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      未发现问题
                    </span>
                  ) : (
                    <span
                      className={`inline-flex items-center gap-1 ${
                        dim.highRiskCount > 0
                          ? 'text-rose-600'
                          : 'text-amber-600'
                      }`}
                    >
                      <AlertTriangle className="h-3.5 w-3.5" />
                      发现 {dim.issueCount} 项风险
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
        ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
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
