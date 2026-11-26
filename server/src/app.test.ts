import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

describe('server API routes', () => {
  it('returns 200 ok from GET /api/health', async () => {
    const app = createApp();
    const res = await app.request('/api/health');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: 'ok',
      service: 'repo-checkup-server',
    });
  });

  it('returns 400 validation errors for missing or invalid repoUrl on POST /api/scan', async () => {
    const app = createApp();

    const emptyRes = await app.request('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoUrl: '   ' }),
    });
    expect(emptyRes.status).toBe(400);
    expect(await emptyRes.json()).toMatchObject({ code: 'INVALID_REQUEST' });

    const badHostRes = await app.request('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoUrl: 'https://example.com/foo/bar' }),
    });
    expect(badHostRes.status).toBe(400);
    expect(await badHostRes.json()).toMatchObject({
      code: 'UNSUPPORTED_PLATFORM',
    });

    const badStreamRes = await app.request('/api/scan/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoUrl: 'https://example.com/foo/bar' }),
    });
    expect(badStreamRes.status).toBe(400);
    expect(await badStreamRes.json()).toMatchObject({
      code: 'UNSUPPORTED_PLATFORM',
    });
  });

  it('returns safe AI config status without apiKey from GET /api/ai/config', async () => {
    const app = createApp();
    const res = await app.request('/api/ai/config');

    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(typeof json.hasEnvConfig).toBe('boolean');
    expect(json).not.toHaveProperty('apiKey');
  });
});
