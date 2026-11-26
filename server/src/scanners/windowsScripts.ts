import path from 'node:path';
import type { RiskItem } from '@repo-checkup/shared';
import type { ScannerModule } from './types.js';

const WINDOWS_SCRIPT_EXTS = new Set(['.bat', '.cmd', '.ps1', '.vbs']);

export const windowsScriptsScanner: ScannerModule = {
  id: 'windows_scripts',
  name: 'Windows 专用脚本',
  maxScore: 20,
  async scan(ctx) {
    const allPathsLower = new Set(
      ctx.files.map((file) => file.relativePath.toLowerCase()),
    );

    const risks: RiskItem[] = [];
    let deduction = 0;

    for (const file of ctx.files) {
      const ext = path.posix.extname(file.relativePath).toLowerCase();
      if (!WINDOWS_SCRIPT_EXTS.has(ext)) {
        continue;
      }

      const dir = path.posix.dirname(file.relativePath);
      const baseWithoutExt = path.posix.basename(file.relativePath, ext);
      const siblingBase =
        dir === '.' ? baseWithoutExt : `${dir}/${baseWithoutExt}`;

      const hasSiblingUnixScript =
        allPathsLower.has(siblingBase.toLowerCase()) ||
        allPathsLower.has(`${siblingBase}.sh`.toLowerCase());

      if (hasSiblingUnixScript) {
        deduction += 2;
        risks.push({
          id: `win-script-${file.relativePath}`,
          dimension: 'windows_scripts',
          ruleId: 'WINDOWS_SCRIPT_WITH_SIBLING',
          title: `检测到 Windows 脚本 ${ext}（存在同目录跨平台脚本）`,
          severity: 'low',
          filePath: file.relativePath,
          suggestion:
            '同目录已存在跨平台脚本，建议在文档和 CI 中优先使用跨平台入口脚本。',
        });
      } else {
        deduction += 6;
        risks.push({
          id: `win-script-${file.relativePath}`,
          dimension: 'windows_scripts',
          ruleId: 'WINDOWS_ONLY_SCRIPT',
          title: `检测到 Windows 专用脚本（${ext}）`,
          severity: 'medium',
          filePath: file.relativePath,
          suggestion:
            'Windows 专用脚本在 macOS/Linux 及容器环境中无法直接运行，建议补充等价的 Shell 脚本或使用 Node/Python 跨平台脚本替代。',
        });
      }
    }

    const cappedDeduction = Math.min(20, deduction);
    const score = Math.max(0, 20 - cappedDeduction);
    const summary =
      risks.length === 0
        ? '未检测到 Windows 专用脚本'
        : `共发现 ${risks.length} 个 Windows 脚本文件`;

    return {
      dimension: 'windows_scripts',
      name: 'Windows 专用脚本',
      maxScore: 20,
      score,
      summary,
      risks,
    };
  },
};
