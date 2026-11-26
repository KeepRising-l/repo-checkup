import type { CheckDimensionId, RiskItem } from '@repo-checkup/shared';

export interface ScannedFile {
  relativePath: string;
  sizeBytes: number;
  isText: boolean;
  content?: string;
}

export interface ScannerContext {
  repoDir: string;
  files: ScannedFile[];
}

export interface ScannerResult {
  dimension: CheckDimensionId;
  name: string;
  maxScore: number;
  score: number;
  summary: string;
  risks: RiskItem[];
  hasBlockingRisk?: boolean;
  details?: Record<string, unknown>;
}

export interface ScannerModule {
  id: CheckDimensionId;
  name: string;
  maxScore: number;
  scan(ctx: ScannerContext): Promise<ScannerResult>;
}
