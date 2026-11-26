import type { GitPlatform } from '@repo-checkup/shared';

export type RepoUrlErrorCode =
  | 'INVALID_URL'
  | 'UNSUPPORTED_PLATFORM'
  | 'INVALID_BRANCH';

export class RepoUrlError extends Error {
  readonly code: RepoUrlErrorCode;

  constructor(code: RepoUrlErrorCode, message: string) {
    super(message);
    this.name = 'RepoUrlError';
    this.code = code;
  }
}

export interface ParsedRepoUrl {
  platform: GitPlatform;
  host: string;
  owner: string;
  repo: string;
  cloneUrl: string;
  webUrl: string;
  requestedBranch?: string;
}

const HOST_PLATFORM_MAP: Record<string, GitPlatform> = {
  'github.com': 'github',
  'gitee.com': 'gitee',
  'gitcode.com': 'gitcode',
  'gitcode.net': 'gitcode',
};

const SAFE_SLUG_RE = /^[A-Za-z0-9._-]+$/;
const CONTROL_OR_SPACE_RE = /[\x00-\x20\x7f]/;
const INVALID_GIT_REF_CHARS_RE = /[~^:?*[\\]/;

function isValidSlug(segment: string): boolean {
  if (!segment || segment === '.' || segment === '..' || segment.startsWith('-')) {
    return false;
  }
  return SAFE_SLUG_RE.test(segment);
}

function validateBranchName(branch: string): string {
  if (
    !branch ||
    branch.startsWith('-') ||
    branch.startsWith('/') ||
    branch.endsWith('/') ||
    branch.endsWith('.') ||
    branch.endsWith('.lock') ||
    branch === '.' ||
    branch === '..' ||
    branch.includes('..') ||
    branch.includes('@{') ||
    branch.includes('//') ||
    CONTROL_OR_SPACE_RE.test(branch) ||
    INVALID_GIT_REF_CHARS_RE.test(branch)
  ) {
    throw new RepoUrlError('INVALID_BRANCH', `分支名称不合法：${branch || '(空)'}`);
  }
  return branch;
}

export function parseRepoUrl(rawInput: string): ParsedRepoUrl {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    throw new RepoUrlError('INVALID_URL', '请输入有效的仓库链接');
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new RepoUrlError(
      'INVALID_URL',
      '仓库链接格式不正确，请输入完整的 https:// 仓库地址',
    );
  }

  if (url.protocol !== 'https:') {
    throw new RepoUrlError('INVALID_URL', '仅支持 https:// 开头的公开仓库链接');
  }

  if (url.username || url.password || url.port) {
    throw new RepoUrlError(
      'INVALID_URL',
      '仓库链接不能包含用户名、密码或自定义端口',
    );
  }

  const normalizedHost = url.hostname.toLowerCase().replace(/^www\./, '');
  const platform = HOST_PLATFORM_MAP[normalizedHost];
  if (!platform) {
    throw new RepoUrlError(
      'UNSUPPORTED_PLATFORM',
      '暂仅支持 GitHub、GitCode、Gitee 公开仓库',
    );
  }

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length < 2) {
    throw new RepoUrlError(
      'INVALID_URL',
      '仓库链接缺少组织/用户名或仓库名，例如 https://github.com/owner/repo',
    );
  }

  const rawOwner = segments[0]!;
  const rawRepo = segments[1]!.replace(/\.git$/i, '');

  if (!isValidSlug(rawOwner) || !isValidSlug(rawRepo)) {
    throw new RepoUrlError('INVALID_URL', '仓库路径中的用户名或仓库名不合法');
  }

  let requestedBranch: string | undefined;

  if (segments.length > 2) {
    let rawBranchSegments: string[] | null = null;
    if (segments[2] === 'tree' && segments.length >= 4) {
      rawBranchSegments = segments.slice(3);
    } else if (
      segments[2] === '-' &&
      segments[3] === 'tree' &&
      segments.length >= 5
    ) {
      rawBranchSegments = segments.slice(4);
    }

    if (!rawBranchSegments) {
      throw new RepoUrlError(
        'INVALID_URL',
        '仅支持仓库根链接或 /tree/<分支名> 格式的链接',
      );
    }

    let decodedBranch: string;
    try {
      decodedBranch = rawBranchSegments
        .map((part) => decodeURIComponent(part))
        .join('/');
    } catch {
      throw new RepoUrlError('INVALID_BRANCH', '分支名称 URL 编码格式有误');
    }

    requestedBranch = validateBranchName(decodedBranch);
  }

  const cloneUrl = `https://${normalizedHost}/${rawOwner}/${rawRepo}.git`;
  const webUrl = `https://${normalizedHost}/${rawOwner}/${rawRepo}`;

  return {
    platform,
    host: normalizedHost,
    owner: rawOwner,
    repo: rawRepo,
    cloneUrl,
    webUrl,
    ...(requestedBranch ? { requestedBranch } : {}),
  };
}
