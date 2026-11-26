import path from 'node:path';
import type { RiskItem } from '@repo-checkup/shared';
import type { ScannerModule } from './types.js';

const DOC_EXTENSIONS = new Set(['.md', '.mdx', '.txt', '.rst']);
const MAX_HITS_PER_FILE = 10;
const MAX_TOTAL_REPORTED_HITS = 50;

const WINDOWS_BACKSLASH_PATH_RE =
  /(?<![A-Za-z0-9_])([A-Za-z]:\\(?:[^\\/:*?"<>|\r\n'`,;\s]+\\)*[^\\/:*?"<>|\r\n'`,;\s]*)/;

const WINDOWS_FORWARD_PATH_RE =
  /(?<![A-Za-z0-9_:])([A-Za-z]:\/(?:Users|Program Files|Windows|Projects|Code|Work|Desktop|Documents|Downloads|AppData|Temp|Data|Workspace)[^\s'"`,;)]*)/i;

const UNIX_HOME_PATH_RE =
  /(?<![A-Za-z0-9_.-])(\/Users\/[A-Za-z0-9._-]+\/[^\s'"`,;)]*|\/home\/[A-Za-z0-9._-]+\/[^\s'"`,;)]*|\/root\/[^\s'"`,;)]*)/;

function isDocFile(relativePath: string): boolean {
  const base = path.posix.basename(relativePath).toUpperCase();
  if (base === 'LICENSE' || base === 'CHANGELOG') {
    return true;
  }
  const ext = path.posix.extname(relativePath).toLowerCase();
  return DOC_EXTENSIONS.has(ext);
}

function findHardcodedPathOnLine(line: string): string | null {
  const winBackslash = WINDOWS_BACKSLASH_PATH_RE.exec(line);
  if (winBackslash?.[1]) {
    return winBackslash[1];
  }

  const winForward = WINDOWS_FORWARD_PATH_RE.exec(line);
  if (winForward?.[1]) {
    return winForward[1];
  }

  const unixHome = UNIX_HOME_PATH_RE.exec(line);
  if (unixHome?.[1]) {
    return unixHome[1];
  }

  return null;
}

function truncateSnippet(line: string): string {
  const trimmed = line.trim();
  return trimmed.length > 160 ? `${trimmed.slice(0, 157)}...` : trimmed;
}

export const hardcodedPathsScanner: ScannerModule = {
  id: 'hardcoded_paths',
  name: '硬编码路径',
  maxScore: 25,
  async scan(ctx) {
    const risks: RiskItem[] = [];
    const perFileHitCount = new Map<string, number>();
    let totalMatchedLines = 0;

    for (const file of ctx.files) {
      if (!file.isText || !file.content || isDocFile(file.relativePath)) {
        continue;
      }

      const lines = file.content.split(/\r?\n/);
      let fileHits = 0;

      for (let idx = 0; idx < lines.length; idx++) {
        const lineText = lines[idx] ?? '';
        const matchedPath = findHardcodedPathOnLine(lineText);
        if (!matchedPath) {
          continue;
        }

        totalMatchedLines++;
        fileHits++;
        perFileHitCount.set(file.relativePath, fileHits);

        if (
          fileHits <= MAX_HITS_PER_FILE &&
          risks.length < MAX_TOTAL_REPORTED_HITS
        ) {
          risks.push({
            id: `hardcoded-path-${file.relativePath}-${idx + 1}`,
            dimension: 'hardcoded_paths',
            ruleId: 'HARDCODED_ABSOLUTE_PATH',
            title: '检测到本机绝对路径硬编码',
            severity: 'medium',
            filePath: file.relativePath,
            line: idx + 1,
            snippet: truncateSnippet(lineText),
            suggestion:
              '改为相对路径、基于运行目录动态拼接（如 path.resolve），或通过环境变量注入路径配置。',
          });
        }
      }
    }

    let deduction = 0;
    for (const hitCount of perFileHitCount.values()) {
      deduction += 5 + Math.max(0, hitCount - 1);
    }

    const score = Math.max(0, 25 - Math.min(25, deduction));
    const affectedFiles = perFileHitCount.size;

    let summary = '未发现硬编码绝对路径';
    if (totalMatchedLines > 0) {
      summary =
        totalMatchedLines > risks.length
          ? `在 ${affectedFiles} 个文件中发现 ${totalMatchedLines} 处硬编码路径（已展示前 ${risks.length} 条）`
          : `在 ${affectedFiles} 个文件中发现 ${totalMatchedLines} 处硬编码路径`;
    }

    return {
      dimension: 'hardcoded_paths',
      name: '硬编码路径',
      maxScore: 25,
      score,
      summary,
      risks,
    };
  },
};
