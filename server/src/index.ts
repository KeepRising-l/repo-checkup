import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { loadLocalEnv } from './services/envLoader.js';

loadLocalEnv();

const port = Number(process.env.PORT ?? 3001);
const app = createApp();

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`repo-checkup server listening on http://localhost:${info.port}`);
  },
);
