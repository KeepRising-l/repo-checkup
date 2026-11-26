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
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            输入公开仓库链接开始体检
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            默认拉取仓库默认分支；若链接包含{' '}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
              /tree/&lt;branch&gt;
            </code>
            ，将自动克隆并体检对应分支。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hint.platform && (
            <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
              已识别：{PLATFORM_LABELS[hint.platform]}
            </span>
          )}
          {hint.branch && (
            <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700">
              <GitBranch className="h-3 w-3" />
              分支：{hint.branch}
            </span>
          )}
        </div>
      </div>

      <form
        className="mt-4 flex flex-col gap-3 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          if (!loading) {
            onSubmit();
          }
        }}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="url"
            value={repoUrl}
            onChange={(event) => onChangeUrl(event.target.value)}
            disabled={loading}
            placeholder="https://github.com/owner/repo 或 https://gitee.com/owner/repo/tree/branch"
            className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pr-9 pl-10 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-500"
          />
          {repoUrl && !loading && (
            <button
              type="button"
              onClick={() => onChangeUrl('')}
              aria-label="清空链接"
              className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <button
          type="submit"
          disabled={loading || !repoUrl.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-xs transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
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

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1 text-slate-400">
          <Sparkles className="h-3.5 w-3.5" />
          示例链接：
        </span>
        {QUICK_EXAMPLES.map((example) => (
          <button
            key={example.url}
            type="button"
            disabled={loading}
            onClick={() => onChangeUrl(example.url)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-50"
          >
            {example.label}
          </button>
        ))}
      </div>

      {error && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
          <span>{error}</span>
        </div>
      )}
    </section>
  );
}
