import type { GitPlatform } from '@repo-checkup/shared';
import {
  AlertCircle,
  GitBranch,
  Loader2,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { detectInputHint } from '../lib/api';

interface RepoInputBarProps {
  repoUrl: string;
  loading: boolean;
  error: string | null;
  onChangeUrl: (nextUrl: string) => void;
  onSubmit: () => void;
}

const PLATFORM_LABELS: Record<GitPlatform, string> = {
  github: 'GitHub',
  gitcode: 'GitCode',
  gitee: 'Gitee',
};

const QUICK_EXAMPLES = [
  {
    label: 'Hono (GitHub)',
    url: 'https://github.com/honojs/hono',
  },
  {
    label: 'Vite (指定 main 分支)',
    url: 'https://github.com/vitejs/vite/tree/main',
  },
];

export function RepoInputBar({
  repoUrl,
  loading,
  error,
  onChangeUrl,
  onSubmit,
}: RepoInputBarProps) {
  const hint = detectInputHint(repoUrl);

  return (
    <section className="rounded-2xl border border-[#e7e5e4] bg-white p-7 shadow-[0_2px_10px_rgba(28,25,23,0.03)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[#1c1917]">
            输入公开仓库链接开始体检
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-[#78716c]">
            默认拉取仓库默认分支；若链接包含{' '}
            <code className="rounded-md border border-[#e7e5e4] bg-[#fafaf9] px-1.5 py-0.5 font-mono text-[11px] text-[#44403c]">
              /tree/&lt;branch&gt;
            </code>
            ，将自动克隆并体检对应分支。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hint.platform && (
            <span className="inline-flex items-center rounded-full border border-[#d6d3d1] bg-[#f5f5f4] px-3 py-1 text-xs font-medium text-[#1c1917]">
              已识别：{PLATFORM_LABELS[hint.platform]}
            </span>
          )}
          {hint.branch && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[#d6d3d1] bg-[#f5f5f4] px-3 py-1 font-mono text-xs font-medium text-[#44403c]">
              <GitBranch className="h-3 w-3 text-[#78716c]" />
              {hint.branch}
            </span>
          )}
        </div>
      </div>

      <form
        className="mt-5 flex flex-col gap-3 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          if (!loading) {
            onSubmit();
          }
        }}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-[#a8a29e]" />
          <input
            type="url"
            value={repoUrl}
            onChange={(event) => onChangeUrl(event.target.value)}
            disabled={loading}
            placeholder="https://github.com/owner/repo 或 https://gitee.com/owner/repo/tree/branch"
            className="w-full rounded-xl border border-[#d6d3d1] bg-[#fafaf9] py-2.5 pr-10 pl-11 text-sm text-[#1c1917] transition outline-none placeholder:text-[#a8a29e] focus:border-[#1c1917] focus:bg-white focus:ring-2 focus:ring-[#1c1917]/10 disabled:bg-[#f5f5f4] disabled:text-[#78716c]"
          />
          {repoUrl && !loading && (
            <button
              type="button"
              onClick={() => onChangeUrl('')}
              aria-label="清空链接"
              className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full p-1 text-[#a8a29e] transition hover:bg-[#e7e5e4]/60 hover:text-[#1c1917]"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <button
          type="submit"
          disabled={loading || !repoUrl.trim()}
          className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-full bg-[#1c1917] px-6 py-2.5 text-sm font-medium text-white shadow-xs transition hover:bg-[#292524] disabled:cursor-not-allowed disabled:bg-[#d6d3d1] disabled:text-[#78716c]"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              体检扫描中...
            </>
          ) : (
            '开始体检'
          )}
        </button>
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[#78716c]">
        <span className="inline-flex items-center gap-1 text-[#a8a29e]">
          <Sparkles className="h-3.5 w-3.5" />
          示例链接：
        </span>
        {QUICK_EXAMPLES.map((example) => (
          <button
            key={example.url}
            type="button"
            disabled={loading}
            onClick={() => onChangeUrl(example.url)}
            className="cursor-pointer rounded-full border border-[#e7e5e4] bg-[#fafaf9] px-3 py-1 text-xs text-[#57534e] transition hover:border-[#1c1917] hover:bg-white hover:text-[#1c1917] disabled:opacity-50"
          >
            {example.label}
          </button>
        ))}
      </div>

      {error && (
        <div
          role="alert"
          className="mt-5 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 animate-enter"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
          <span>{error}</span>
        </div>
      )}
    </section>
  );
}
