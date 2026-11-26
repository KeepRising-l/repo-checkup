import { useEffect, useState } from 'react';
import type { ScanProgressEvent, ScanStage } from '@repo-checkup/shared';
import { Check, Loader2 } from 'lucide-react';

interface ScanProgressBarProps {
  repoUrl: string;
  progress: ScanProgressEvent;
  startedAt: number;
}

const MILESTONES: Array<{ stage: ScanStage; label: string }> = [
  { stage: 'validate', label: '校验链接' },
  { stage: 'clone', label: '克隆仓库' },
  { stage: 'metadata', label: '提取快照' },
  { stage: 'scan', label: '规则扫描' },
  { stage: 'score', label: '生成报告' },
];

const STAGE_ORDER: Record<ScanStage, number> = {
  validate: 0,
  clone: 1,
  metadata: 2,
  scan: 3,
  score: 4,
  done: 5,
};

export function ScanProgressBar({
  repoUrl,
  progress,
  startedAt,
}: ScanProgressBarProps) {
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    setElapsedSec((Date.now() - startedAt) / 1000);
    const id = window.setInterval(() => {
      setElapsedSec((Date.now() - startedAt) / 1000);
    }, 100);
    return () => window.clearInterval(id);
  }, [startedAt]);

  const clampedPercent = Math.max(0, Math.min(100, Math.round(progress.percent)));
  const currentStageIdx = STAGE_ORDER[progress.stage] ?? 0;

  return (
    <section className="rounded-2xl border border-[#e7e5e4] bg-white p-7 shadow-[0_2px_10px_rgba(28,25,23,0.03)] animate-enter">
      {/* Top Info + Percentage */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#1c1917]" />
            <h3 className="text-sm font-semibold text-[#1c1917]">
              {progress.label}
            </h3>
          </div>
          <p className="truncate font-mono text-xs text-[#78716c]">{repoUrl}</p>
        </div>

        <div className="flex shrink-0 items-baseline gap-3">
          <span className="font-mono text-xs text-[#a8a29e] tabular-nums">
            {elapsedSec.toFixed(1)}s
          </span>
          <span className="font-mono text-3xl font-bold tracking-tight text-[#1c1917] tabular-nums">
            {clampedPercent}
            <span className="ml-0.5 text-base font-semibold text-[#78716c]">
              %
            </span>
          </span>
        </div>
      </div>

      {/* Game-style Horizontal Progress Bar */}
      <div className="relative mt-5">
        <div
          role="progressbar"
          aria-valuenow={clampedPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          className="relative h-3.5 w-full overflow-hidden rounded-full border border-[#e7e5e4] bg-[#f5f5f4] p-0.5"
        >
          <div
            className="progress-shimmer h-full rounded-full transition-[width] duration-300 ease-out"
            style={{ width: `${Math.max(4, clampedPercent)}%` }}
          />
          {/* Subtle 25/50/75 ticks */}
          <span className="pointer-events-none absolute top-0 bottom-0 left-1/4 w-px bg-[#d6d3d1]/70" />
          <span className="pointer-events-none absolute top-0 bottom-0 left-1/2 w-px bg-[#d6d3d1]/70" />
          <span className="pointer-events-none absolute top-0 bottom-0 left-3/4 w-px bg-[#d6d3d1]/70" />
        </div>
      </div>

      {/* Bottom Milestones + Detail */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {MILESTONES.map((step, idx) => {
            const isCompleted = currentStageIdx > idx;
            const isCurrent = currentStageIdx === idx;
            return (
              <span
                key={step.stage}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  isCompleted
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : isCurrent
                      ? 'border-[#1c1917] bg-[#1c1917] text-white'
                      : 'border-[#e7e5e4] bg-[#fafaf9] text-[#a8a29e]'
                }`}
              >
                {isCompleted ? (
                  <Check className="h-3 w-3" />
                ) : isCurrent ? (
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-[#d6d3d1]" />
                )}
                {step.label}
              </span>
            );
          })}
        </div>

        {progress.detail && (
          <span className="font-mono text-xs text-[#78716c]">
            {progress.detail}
          </span>
        )}
      </div>
    </section>
  );
}
