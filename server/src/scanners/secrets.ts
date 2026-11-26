import path from 'node:path';
import type { RiskItem } from '@repo-checkup/shared';
import { isTestOrFixtureFile } from './fileClassifier.js';
import type { ScannerModule } from './types.js';

const ENV_TEMPLATE_RE =
  /^\.env\.(example|sample|template|dist|defaults?)(\..+)?$/i;

const PRIVATE_KEY_FILE_NAMES = new Set([
  'id_rsa',
  'id_dsa',
  'id_ecdsa',
  'id_ed25519',
]);

const PRIVATE_KEY_FILE_EXTS = new Set(['.pem', '.key', '.p12', '.pfx']);

interface SecretRule {
  ruleId: string;
  title: string;
  regex: RegExp;
  suggestion: string;
}

const SECRET_RULES: SecretRule[] = [
  {
    ruleId: 'SECRET_SK_KEY',
    title: '疑似明文 sk- 密钥泄露',
    regex: /\bsk-(?:proj-|live-|test-)?[A-Za-z0-9_-]{20,}\b/g,
    suggestion:
      '立即吊销并轮换该密钥，改为通过环境变量或密钥管理服务注入。',
  },
  {
    ruleId: 'SECRET_AKID_KEY',
    title: '疑似明文 AKID 云访问密钥泄露',
    regex: /\bAKID[A-Za-z0-9]{20,}\b/g,
    suggestion:
      '立即禁用并重新生成访问密钥，严禁将云厂商 AK/SK 提交到代码仓库。',
  },
  {
    ruleId: 'SECRET_AWS_AKIA',
    title: '疑似明文 AWS Access Key（AKIA）泄露',
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
    suggestion:
      '立即吊销该 IAM Access Key，并使用环境变量或 IAM Role 替代。',
  },
  {
    ruleId: 'SECRET_BEARER_TOKEN',
    title: '疑似硬编码 Bearer Token 凭证',
    regex: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/g,
    suggestion:
      '移除源码或配置中的硬编码令牌，并在签发侧使旧 Token 失效。',
  },
  {
    ruleId: 'SECRET_PRIVATE_KEY_BLOCK',
    title: '检测到私钥 PEM 内容片段',
    regex: /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/g,
    suggestion:
      '从仓库中移除私钥内容并清理 Git 历史，重新签发证书或密钥对。',
  },
];

const PLACEHOLDER_INDICATORS = [
  'xxxx',
  'example',
  'placeholder',
  'your_',
  'your-',
  'dummy',
  'changeme',
  'plain-text',
  'plain_text',
  'plain-key',
  'plain_key',
  'fake-',
  'fake_',
  'mock-',
  'mock_',
  'test-key',
  'test_key',
  '12345678',
  'abcdefgh',
  '${',
  '{{',
  '<your',
];

export function maskSecret(raw: string): string {
  if (/^Bearer\s+/i.test(raw)) {
    const spaceIdx = raw.search(/\s+/);
    const prefix = raw.slice(0, spaceIdx + 1);
    const token = raw.slice(spaceIdx + 1).trim();
    return `${prefix}${maskSecret(token)}`;
  }

  if (raw.startsWith('-----BEGIN')) {
    return '-----BEGIN **** PRIVATE KEY-----';
  }

  if (raw.length <= 8) {
    return `${raw.slice(0, 2)}****`;
  }

  return `${raw.slice(0, 4)}****${raw.slice(-4)}`;
}

function isPlaceholder(value: string): boolean {
  const lower = value.toLowerCase();
  if (PLACEHOLDER_INDICATORS.some((indicator) => lower.includes(indicator))) {
    return true;
  }

  const stripped = value
    .replace(/^(?:Bearer\s+|sk-(?:proj-|live-|test-)?|AKID|AKIA)/i, '')
    .trim();

  // Repeated single character after prefix, e.g. sk-aaaa... or AKID0000...
  if (/^(.)\1{9,}$/.test(stripped) || /(.)\1{11,}/.test(stripped)) {
    return true;
  }
  return false;
}

function isCommittedEnvFile(baseName: string): boolean {
  const lower = baseName.toLowerCase();
  if (lower !== '.env' && !lower.startsWith('.env.')) {
    return false;
  }
  return !ENV_TEMPLATE_RE.test(lower);
}

function isCommittedKeyFile(baseName: string): boolean {
  const lower = baseName.toLowerCase();
  if (PRIVATE_KEY_FILE_NAMES.has(lower)) {
    return true;
  }
  const ext = path.posix.extname(lower);
  return PRIVATE_KEY_FILE_EXTS.has(ext);
}

function maskLineSnippet(line: string, matches: string[]): string {
  let masked = line.trim();
  for (const secret of matches) {
    masked = masked.split(secret).join(maskSecret(secret));
  }
  return masked.length > 160 ? `${masked.slice(0, 157)}...` : masked;
}

export const secretsScanner: ScannerModule = {
  id: 'secrets',
  name: '密钥与敏感信息风险',
  maxScore: 30,
  async scan(ctx) {
    const risks: RiskItem[] = [];
    let deduction = 0;
    let hasBlockingRisk = false;

    for (const file of ctx.files) {
      const base = path.posix.basename(file.relativePath);

      if (isCommittedEnvFile(base)) {
        hasBlockingRisk = true;
        deduction += 15;
        risks.push({
          id: `secret-env-${file.relativePath}`,
          dimension: 'secrets',
          ruleId: 'COMMITTED_ENV_FILE',
          title: `敏感环境变量文件 ${base} 直接提交到了仓库`,
          severity: 'high',
          filePath: file.relativePath,
          suggestion:
            '立即将 .env 加入 .gitignore 并从仓库与历史记录中移除，仅保留 .env.example 作为字段模板，同时轮换已暴露凭证。',
        });
      }

      if (isCommittedKeyFile(base)) {
        hasBlockingRisk = true;
        deduction += 15;
        risks.push({
          id: `secret-keyfile-${file.relativePath}`,
          dimension: 'secrets',
          ruleId: 'COMMITTED_KEY_FILE',
          title: `检测到密钥/证书文件 ${base} 直接入库`,
          severity: 'high',
          filePath: file.relativePath,
          suggestion:
            '确认是否为真实私钥或生产证书；若是，请立即吊销重建并将密钥文件移出 Git 仓库。',
        });
      }

      if (!file.isText || !file.content) {
        continue;
      }

      const isTestFile = isTestOrFixtureFile(file.relativePath);
      const lines = file.content.split(/\r?\n/);
      for (let idx = 0; idx < lines.length; idx++) {
        const line = lines[idx] ?? '';
        for (const rule of SECRET_RULES) {
          rule.regex.lastIndex = 0;
          const matches: string[] = [];
          let match: RegExpExecArray | null;
          while ((match = rule.regex.exec(line)) !== null) {
            const candidate = match[0];
            if (!isPlaceholder(candidate)) {
              matches.push(candidate);
            }
          }

          if (matches.length === 0) {
            continue;
          }

          if (isTestFile) {
            deduction += 5;
            risks.push({
              id: `secret-${rule.ruleId}-${file.relativePath}-${idx + 1}`,
              dimension: 'secrets',
              ruleId: rule.ruleId,
              title: `${rule.title}（位于测试文件，请核实）`,
              severity: 'medium',
              filePath: file.relativePath,
              line: idx + 1,
              snippet: maskLineSnippet(line, matches),
              suggestion:
                '请确认是否为真实凭证；若仅为单测模拟数据，建议替换为显式占位符（如 sk-mock-key-placeholder）。',
            });
          } else {
            hasBlockingRisk = true;
            deduction += 15;
            risks.push({
              id: `secret-${rule.ruleId}-${file.relativePath}-${idx + 1}`,
              dimension: 'secrets',
              ruleId: rule.ruleId,
              title: rule.title,
              severity: 'high',
              filePath: file.relativePath,
              line: idx + 1,
              snippet: maskLineSnippet(line, matches),
              suggestion: rule.suggestion,
            });
          }
        }
      }
    }

    const score = Math.max(0, 30 - Math.min(30, deduction));
    const highRiskCount = risks.filter((r) => r.severity === 'high').length;
    let summary = '未检测到密钥或敏感文件泄露风险';
    if (risks.length > 0) {
      summary =
        highRiskCount > 0
          ? `发现 ${risks.length} 项密钥或敏感信息风险（其中高危 ${highRiskCount} 项）`
          : `在测试文件中发现 ${risks.length} 项疑似密钥（请人工核实）`;
    }

    return {
      dimension: 'secrets',
      name: '密钥与敏感信息风险',
      maxScore: 30,
      score,
      summary,
      risks,
      hasBlockingRisk,
    };
  },
};
