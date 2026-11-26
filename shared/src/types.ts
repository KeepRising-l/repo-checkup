export type GitPlatform = 'github' | 'gitcode' | 'gitee';

export type CheckDimensionId =
  | 'completeness'
  | 'windows_scripts'
  | 'hardcoded_paths'
  | 'secrets';

export type RiskSeverity = 'high' | 'medium' | 'low';

export type ReadinessLevel = 'ready' | 'needs_work' | 'high_risk';

export interface ScanRequest {
  repoUrl: string;
}

export interface RepoMetadata {
  platform: GitPlatform;
  owner: string;
  repo: string;
  cloneUrl: string;
  webUrl: string;
  requestedBranch?: string;
  scannedBranch: string;
  commitSha: string;
  commitShortSha: string;
  commitMessage?: string;
  commitDate?: string;
  scannedFiles: number;
  skippedFiles: number;
  durationMs: number;
}

export interface CompletenessDetails {
  hasReadme: boolean;
  readmeFiles: string[];
  hasDependencyManifest: boolean;
  dependencyFiles: string[];
  hasStartupEntry: boolean;
  startupEntries: string[];
}

export interface RiskItem {
  id: string;
  dimension: CheckDimensionId;
  ruleId: string;
  title: string;
  severity: RiskSeverity;
  filePath?: string;
  line?: number;
  snippet?: string;
  suggestion: string;
}

export interface DimensionSummary {
  id: CheckDimensionId;
  name: string;
  score: number;
  maxScore: number;
  issueCount: number;
  highRiskCount: number;
  summary: string;
  details?: Record<string, unknown>;
}

export interface ScanReport {
  repo: RepoMetadata;
  totalScore: number;
  readinessLevel: ReadinessLevel;
  hasBlockingRisk: boolean;
  dimensions: DimensionSummary[];
  risks: RiskItem[];
  scannedAt: string;
}

export interface ScanErrorResponse {
  error: string;
  code: string;
}

export interface AiConfigStatus {
  hasEnvConfig: boolean;
  defaultBaseUrl?: string;
  defaultModel?: string;
}

export interface AiClientConfig {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

export interface AiModelsRequest {
  baseUrl?: string;
  apiKey?: string;
}

export interface AiModelsResponse {
  models: string[];
  source: 'env' | 'custom';
}

export interface AiAdviceRequest {
  report: ScanReport;
  config?: AiClientConfig;
}

export interface AiAdviceDetail {
  whyItMatters: string;
  relatedFiles: string[];
  actionSteps: string[];
  expectedImpact: string;
}

export interface AiAdviceItem {
  id: string;
  title: string;
  severity: RiskSeverity;
  summary: string;
  detail: AiAdviceDetail;
}

export interface AiAdviceReport {
  aiScore: number;
  overview: string;
  items: AiAdviceItem[];
  modelUsed: string;
  configSource: 'env' | 'custom';
  generatedAt: string;
}
