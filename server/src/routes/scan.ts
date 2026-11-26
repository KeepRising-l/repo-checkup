import { Hono } from 'hono';
import { z } from 'zod';
import type { RepoMetadata, ScanErrorResponse } from '@repo-checkup/shared';
import { runScanners } from '../scanners/engine.js';
import { defaultScanners } from '../scanners/index.js';
import { buildScanReport } from '../scoring.js';
import { cloneRepository, GitCloneError } from '../services/gitClone.js';
import { parseRepoUrl, RepoUrlError } from '../services/repoUrl.js';

const scanRequestSchema = z.object({
  repoUrl: z.string().trim().min(1, '请输入仓库链接'),
});

export const scanRoute = new Hono();

scanRoute.post('/', async (c) => {
  const startedAt = Date.now();
  const body: unknown = await c.req.json().catch(() => null);
  const parsedBody = scanRequestSchema.safeParse(body);

  if (!parsedBody.success) {
    const response: ScanErrorResponse = {
      error: parsedBody.error.issues[0]?.message ?? '请求参数不合法',
      code: 'INVALID_REQUEST',
    };
    return c.json(response, 400);
  }

  let parsedRepo;
  try {
    parsedRepo = parseRepoUrl(parsedBody.data.repoUrl);
  } catch (error) {
    if (error instanceof RepoUrlError) {
      const response: ScanErrorResponse = {
        error: error.message,
        code: error.code,
      };
      return c.json(response, 400);
    }
    throw error;
  }

  let cloned;
  try {
    cloned = await cloneRepository(parsedRepo);
  } catch (error) {
    if (error instanceof GitCloneError) {
      const response: ScanErrorResponse = {
        error: error.message,
        code: error.code,
      };
      if (error.code === 'REPO_NOT_FOUND' || error.code === 'BRANCH_NOT_FOUND') {
        return c.json(response, 404);
      }
      if (error.code === 'CLONE_TIMEOUT') {
        return c.json(response, 504);
      }
      return c.json(response, 500);
    }

    const response: ScanErrorResponse = {
      error: '拉取仓库时发生未知错误',
      code: 'CLONE_FAILED',
    };
    return c.json(response, 500);
  }

  try {
    const engineOutput = await runScanners(cloned.repoDir, defaultScanners);
    const repoMeta: RepoMetadata = {
      platform: parsedRepo.platform,
      owner: parsedRepo.owner,
      repo: parsedRepo.repo,
      cloneUrl: parsedRepo.cloneUrl,
      webUrl: parsedRepo.webUrl,
      ...(parsedRepo.requestedBranch
        ? { requestedBranch: parsedRepo.requestedBranch }
        : {}),
      scannedBranch: cloned.scannedBranch,
      commitSha: cloned.commitSha,
      commitShortSha: cloned.commitShortSha,
      ...(cloned.commitMessage ? { commitMessage: cloned.commitMessage } : {}),
      ...(cloned.commitDate ? { commitDate: cloned.commitDate } : {}),
      scannedFiles: engineOutput.scannedFiles,
      skippedFiles: engineOutput.skippedFiles,
      durationMs: Date.now() - startedAt,
    };

    const report = buildScanReport(repoMeta, engineOutput.results);
    return c.json(report, 200);
  } catch {
    const response: ScanErrorResponse = {
      error: '扫描仓库文件时发生错误',
      code: 'SCAN_FAILED',
    };
    return c.json(response, 500);
  } finally {
    await cloned.cleanup().catch(() => {});
  }
});
