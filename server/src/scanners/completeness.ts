import path from 'node:path';
import type { CompletenessDetails, RiskItem } from '@repo-checkup/shared';
import type { ScannerModule } from './types.js';

const README_RE = /^readme(\.(md|mdx|txt|rst|adoc))?$/i;

const DEPENDENCY_MANIFEST_NAMES = new Set([
  'package.json',
  'requirements.txt',
  'pyproject.toml',
  'pipfile',
  'setup.py',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'go.mod',
  'cargo.toml',
  'composer.json',
  'gemfile',
  'pubspec.yaml',
  'cmakelists.txt',
  'environment.yml',
]);

const STARTUP_FILE_NAMES = new Set([
  'dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
  'makefile',
  'procfile',
  'justfile',
  'start.sh',
  'run.sh',
  'entrypoint.sh',
  'manage.py',
  'main.py',
  'app.py',
  'main.go',
]);

const PACKAGE_STARTUP_SCRIPT_RE =
  /^(start|dev|serve|preview|run|build|server|client)/i;

function depthOf(relativePath: string): number {
  return relativePath.split('/').length;
}

function isDependencyManifest(relativePath: string): boolean {
  if (depthOf(relativePath) > 2) {
    return false;
  }
  const base = path.posix.basename(relativePath).toLowerCase();
  return DEPENDENCY_MANIFEST_NAMES.has(base) || base.endsWith('.csproj');
}

function hasPackageStartupScripts(content: string | undefined): boolean {
  if (!content) {
    return false;
  }
  try {
    const parsed = JSON.parse(content) as { scripts?: unknown };
    if (!parsed.scripts || typeof parsed.scripts !== 'object') {
      return false;
    }
    return Object.keys(parsed.scripts).some((key) =>
      PACKAGE_STARTUP_SCRIPT_RE.test(key),
    );
  } catch {
    return false;
  }
}

export const completenessScanner: ScannerModule = {
  id: 'completeness',
  name: '基础完整度',
  maxScore: 25,
  async scan(ctx) {
    const readmeFiles: string[] = [];
    const dependencyFiles: string[] = [];
    const startupEntries: string[] = [];

    for (const file of ctx.files) {
      const base = path.posix.basename(file.relativePath);
      const lowerBase = base.toLowerCase();
      const depth = depthOf(file.relativePath);

      if (depth === 1 && README_RE.test(base)) {
        readmeFiles.push(file.relativePath);
      }

      if (isDependencyManifest(file.relativePath)) {
        dependencyFiles.push(file.relativePath);
      }

      if (depth <= 2) {
        if (STARTUP_FILE_NAMES.has(lowerBase)) {
          startupEntries.push(file.relativePath);
        } else if (
          lowerBase === 'package.json' &&
          hasPackageStartupScripts(file.content)
        ) {
          startupEntries.push(`${file.relativePath}#scripts`);
        }
      }
    }

    const hasReadme = readmeFiles.length > 0;
    const hasDependencyManifest = dependencyFiles.length > 0;
    const hasStartupEntry = startupEntries.length > 0;

    const risks: RiskItem[] = [];
    let score = 25;

    if (!hasReadme) {
      score -= 8;
      risks.push({
        id: 'completeness-missing-readme',
        dimension: 'completeness',
        ruleId: 'MISSING_README',
        title: '缺少根目录 README 文档',
        severity: 'medium',
        suggestion:
          '在仓库根目录补充 README.md，说明项目用途、运行前置条件与启动方式。',
      });
    }

    if (!hasDependencyManifest) {
      score -= 9;
      risks.push({
        id: 'completeness-missing-deps',
        dimension: 'completeness',
        ruleId: 'MISSING_DEPENDENCY_MANIFEST',
        title: '未检测到常见依赖清单文件',
        severity: 'medium',
        suggestion:
          '补充对应技术栈的依赖清单（如 package.json、requirements.txt、pyproject.toml、go.mod、pom.xml 等），确保环境可复现安装。',
      });
    }

    if (!hasStartupEntry) {
      score -= 8;
      risks.push({
        id: 'completeness-missing-startup',
        dimension: 'completeness',
        ruleId: 'MISSING_STARTUP_ENTRY',
        title: '缺少明确的启动脚本或容器入口',
        severity: 'medium',
        suggestion:
          '在 package.json 中配置 start/dev 脚本，或提供 Dockerfile / docker-compose.yml / Makefile / 启动脚本等标准入口。',
      });
    }

    const details: CompletenessDetails = {
      hasReadme,
      readmeFiles,
      hasDependencyManifest,
      dependencyFiles,
      hasStartupEntry,
      startupEntries,
    };

    const missingParts: string[] = [];
    if (!hasReadme) missingParts.push('README');
    if (!hasDependencyManifest) missingParts.push('依赖清单');
    if (!hasStartupEntry) missingParts.push('启动入口');

    const summary =
      missingParts.length === 0
        ? 'README、依赖清单与启动入口均已具备'
        : `缺少：${missingParts.join('、')}`;

    return {
      dimension: 'completeness',
      name: '基础完整度',
      maxScore: 25,
      score: Math.max(0, score),
      summary,
      risks,
      details: details as unknown as Record<string, unknown>,
    };
  },
};
