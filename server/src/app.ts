import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { scanRoute } from './routes/scan.js';

export function createApp() {
  const app = new Hono();

  app.use('/api/*', cors());

  app.get('/api/health', (c) => {
    return c.json({
      status: 'ok',
      service: 'repo-checkup-server',
    });
  });

  app.route('/api/scan', scanRoute);

  return app;
}
