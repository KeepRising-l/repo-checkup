import { useEffect } from 'react';
import type { AiAdviceItem, RiskSeverity } from '@repo-checkup/shared';
import {
  CheckCircle2,
  FileCode2,
  ListChecks,
  ShieldAlert,
  X,
} from 'lucide-react';

interface AiAdviceDrawerProps {
  item: AiAdviceItem | null;
  onClose: () => void;
}

const SEVERITY_META: Record<
  RiskSeverity,
  { label: string; badgeClass: string }
> = {
  high: {
    label: '高危',
    badgeClass: 'border-rose-200 bg-rose-50 text-rose-700',
  },
  medium: {
    label: '中危',
    badgeClass: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  low: {
    label: '低危',
    badgeClass: 'border-[#e7e5e4] bg-[#f5f5f4] text-[#57534e]',
  },
};

export function AiAdviceDrawer({ item, onClose }: AiAdviceDrawerProps) {
  useEffect(() => {
    if (!item) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [item, onClose]);

  if (!item) {
    return null;
  }

  const sev = SEVERITY_META[item.severity];

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[#1c1917]/35 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={item.title}
        onClick={(event) => event.stopPropagation()}
        className="drawer-enter flex h-full w-full max-w-lg flex-col border-l border-[#e7e5e4] bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#e7e5e4] px-7 py-6">
          <div className="space-y-2.5">
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${sev.badgeClass}`}
            >
              {sev.label}
            </span>
            <h3 className="text-lg font-semibold leading-snug text-[#1c1917]">
              {item.title}
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="关闭详情"
            className="cursor-pointer rounded-full border border-[#e7e5e4] p-2 text-[#78716c] transition hover:bg-[#f5f5f4] hover:text-[#1c1917]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-7 py-6">
          <div className="rounded-xl border border-[#e7e5e4] bg-[#fafaf9] p-4">
            <div className="text-xs font-semibold text-[#78716c]">
              大白话摘要
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-[#1c1917]">
              {item.summary}
            </p>
          </div>

          <section className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-[#78716c] uppercase">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              <h4>为什么会影响接入</h4>
            </div>
            <p className="text-sm leading-relaxed text-[#44403c]">
              {item.detail.whyItMatters}
            </p>
          </section>

          {item.detail.relatedFiles.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-[#78716c] uppercase">
                <FileCode2 className="h-4 w-4 text-[#57534e]" />
                <h4>涉及文件</h4>
              </div>
              <ul className="space-y-1.5">
                {item.detail.relatedFiles.map((file) => (
                  <li
                    key={file}
                    className="rounded-lg border border-[#e7e5e4] bg-[#f5f5f4] px-3 py-2 font-mono text-xs text-[#292524]"
                  >
                    {file}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-[#78716c] uppercase">
              <ListChecks className="h-4 w-4 text-[#1c1917]" />
              <h4>分步改造建议</h4>
            </div>
            <ol className="space-y-2.5">
              {item.detail.actionSteps.map((step, index) => (
                <li
                  key={`${index}-${step}`}
                  className="flex items-start gap-3 rounded-xl border border-[#e7e5e4] bg-white p-3.5 text-sm text-[#292524]"
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#1c1917] font-mono text-[11px] font-semibold text-white">
                    {index + 1}
                  </span>
                  <span className="leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-[#78716c] uppercase">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <h4>预期收益</h4>
            </div>
            <p className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm leading-relaxed text-emerald-900">
              {item.detail.expectedImpact}
            </p>
          </section>
        </div>
      </aside>
    </div>
  );
}
