import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import pinoHttpModule from 'pino-http';
import { createServer as createHttpServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  createLocationsRouter,
  type WeatherClient,
} from './routes/locations.js';
import { logger } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pinoHttp = pinoHttpModule.default ?? pinoHttpModule;
const FRONTEND_EVENT_PATTERN = /^[a-z][a-z0-9_.:-]{1,63}$/;

interface AppOptions {
  serveFrontend?: boolean;
  enableRequestLogging?: boolean;
  weatherClient?: WeatherClient;
}

export async function createApp(options: AppOptions = {}) {
  const app = express();
  const server = createHttpServer(app);
  const serveFrontend =
    options.serveFrontend ?? process.env.NODE_ENV !== 'test';
  const enableRequestLogging =
    options.enableRequestLogging ?? process.env.NODE_ENV !== 'test';

  app.use(helmet());

  if (enableRequestLogging) {
    app.use(pinoHttp({ logger }));
  }

  app.use((request, response, next) => {
    if (request.path.startsWith('/frontman')) {
      next();
      return;
    }

    express.json()(request, response, next);
  });

  app.get('/health', (_request, response) => {
    response.json({ status: 'healthy' });
  });

  app.post('/api/logs', (request, response) => {
    const event = request.body?.event;
    const metadata = request.body?.metadata;
    if (typeof event !== 'string' || !FRONTEND_EVENT_PATTERN.test(event)) {
      response.status(422).json({ detail: 'event is required' });
      return;
    }
    logger.info(
      {
        source: 'frontend',
        event,
        metadata:
          metadata && typeof metadata === 'object' ? metadata : undefined,
        page:
          typeof request.body?.page === 'string'
            ? request.body.page
            : undefined,
      },
      'frontend interaction',
    );
    response.status(204).end();
  });

  app.use(
    '/api',
    createLocationsRouter({ weatherClient: options.weatherClient }),
  );

  if (serveFrontend) {
    if (process.env.NODE_ENV === 'production') {
      const staticPath = resolve(__dirname, '..', '..', 'frontend', 'dist');
      app.use(express.static(staticPath));
      app.get('*', (_request, response) => {
        response.sendFile(resolve(staticPath, 'index.html'));
      });
    } else {
      const { createServer } = await import('vite');
      const vite = await createServer({
        root: resolve(__dirname, '..', '..', 'frontend'),
        server: { middlewareMode: { server } },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    }
  }

  app.use(
    (
      error: unknown,
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction,
    ) => {
      logger.error({ err: error }, 'request failed');
      response.status(500).json({ detail: 'Internal server error' });
    },
  );

  return { app, server };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '127.0.0.1';
  const { server } = await createApp();

  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Weather Starter shutting down');

    const forceExitTimer = setTimeout(() => {
      logger.error({ signal }, 'Weather Starter forced shutdown');
      process.exit(1);
    }, 10_000);
    forceExitTimer.unref();

    server.close((error) => {
      clearTimeout(forceExitTimer);
      if (error) {
        logger.error({ err: error, signal }, 'Weather Starter shutdown failed');
        process.exit(1);
      }

      logger.info({ signal }, 'Weather Starter stopped');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  server.listen(port, host, () => {
    logger.info(
      { host, port },
      'Weather Starter listening',
    );
  });
}
