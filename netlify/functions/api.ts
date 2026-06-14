// Netlify Function that runs the entire Express app. The `/api/*` and `/health`
// paths are redirected here by netlify.toml; serverless-http adapts the Lambda
// event into a request the Express app can handle. The app is created once per
// warm container and reused across invocations.
//
// Imports the compiled backend (`npm run build` runs before functions are
// bundled), so the resolved `.js` specifiers line up with esbuild.
import serverless from 'serverless-http';
import type { Handler } from '@netlify/functions';
import { createApp } from '../../backend/dist/server.js';

type ServerlessHandler = (event: unknown, context: unknown) => Promise<unknown>;

let cached: ServerlessHandler | null = null;

async function getHandler(): Promise<ServerlessHandler> {
  if (!cached) {
    const { app } = await createApp({ serveFrontend: false });
    cached = serverless(app) as unknown as ServerlessHandler;
  }
  return cached;
}

export const handler: Handler = async (event, context) => {
  const run = await getHandler();
  return (await run(event, context)) as Awaited<ReturnType<Handler>>;
};
