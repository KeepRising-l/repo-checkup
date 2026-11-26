import type {
  CheckDimensionId,
  DimensionSummary,
  ReadinessLevel,
  RepoMetadata,
  RiskItem,
  RiskSeverity,
  ScanReport,
} from '@repo-checkup/shared';
import type { ScannerResult } from './scanners/types.js';

const SEVERITY_ORDER: Record<RiskSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const DIMENSION_ORDER: Record<CheckDimensionId, number> = {
  secrets: 0,
  completeness: 1,
  hardcoded_paths: 2,
  windows_scripts: 3,
};

function sortRisks(risks: RiskItem[]): RiskItem[] {
  return [...risks].sort((a, b) => {
    const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sevDiff !== 0) return sevDiff;

    const dimDiff = DIMENSION_ORDER[a.dimension] - DIMENSION_ORDER[b.dimension];
    if (dimDiff !== 0) return dimDiff;

    const pathA = a.filePath ?? '';
    const pathB = b.filePath ?? '';
    if (pathA !== pathB) return pathA.localeCompare(pathB);

    return (a.line ?? 0) - (b.line ?? 0);
  });
}

export function buildScanReport(
  repo: RepoMetadata,
  results: ScannerResult[],
): ScanReport {
  const dimensions: DimensionSummary[] = results.map((result) => ({
    id: result.dimension,
    name: result.name,
    score: result.score,
    maxScore: result.maxScore,
    issueCount: result.risks.length,
    highRiskCount: result.risks.filter((r) => r.severity === 'high').length,
    summary: result.summary,
    ...(result.details ? { details: result.details } : {}),
  }));

  const rawTotal = results.reduce((sum, item) => sum + item.score, 0);
  const totalScore = Math.max(0, Math.min(100, rawTotal));
  const hasBlockingRisk = results.some((r) => Boolean(r.hasBlockingRisk));

  let readinessLevel: ReadinessLevel = 'ready';
  if (hasBlockingRisk || totalScore < 60) {
    readinessLevel = 'high_risk';
  } else if (totalScore < 85) {
    readinessLevel = 'needs_work';
  }

  const risks = sortRisks(results.flatMap((r) => r.risks));

  return {
    repo,
    totalScore,
    readinessLevel,
    hasBlockingRisk,
    dimensions,
    risks,
    scannedAt: new Date().toISOString(),
  };
}
