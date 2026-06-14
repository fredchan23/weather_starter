import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import pinoHttpModule from 'pino-http';
import { createServer as createHttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  createLocationsRouter,
  type WeatherClient,
} from './routes/locations.js';
import { logger } from './logger.js';

// import.meta.url is empty when bundled to CommonJS (the Netlify Functions
// bundler). __dirname is only used by the production static-serve branch, which
// the function never runs (serveFrontend:false), so a cwd fallback is safe there.
const __dirname = import.meta.url
  ? dirname(fileURLToPath(import.meta.url))
  : process.cwd();
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

  // On Netlify the app runs behind the platform proxy, so the real client IP and
  // protocol arrive via forwarded headers. Trusting the proxy lets req.ip and
  // req.secure resolve correctly (needed for rate limiting and secure cookies).
  if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', true);
  }

  const serveFrontend =
    options.serveFrontend ?? process.env.NODE_ENV !== 'test';
  const enableRequestLogging =
    options.enableRequestLogging ?? process.env.NODE_ENV !== 'test';

  const isDev = process.env.NODE_ENV !== 'production';
  app.use(
    helmet({
      contentSecurityPolicy: isDev ? false : {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          'img-src': ["'self'", 'data:', 'https://*.cartocdn.com', 'https://*.openstreetmap.org'],
          'connect-src': ["'self'"],
        },
      },
    }),
  );

  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (allowedOrigins.length > 0) {
    app.use('/api', cors({ origin: allowedOrigins, credentials: true }));
  }

  if (enableRequestLogging) {
    app.use(pinoHttp({ logger }));
  }

  // Key on Netlify's trustworthy client-IP header when present (falling back to
  // req.ip), normalizing IPv6 via the library helper. Disable the trust-proxy
  // validation since we deliberately trust the Netlify proxy.
  const clientIp = (request: express.Request): string =>
    ipKeyGenerator(
      (request.headers['x-nf-client-connection-ip'] as string) ||
        request.ip ||
        'unknown',
    );
  const limiterBase = {
    windowMs: 60_000,
    standardHeaders: 'draft-6' as const,
    legacyHeaders: false,
    keyGenerator: clientIp,
    validate: { trustProxy: false },
  };
  // General API limit: 120 req/min per IP
  const apiLimiter = rateLimit({ ...limiterBase, max: 120 });
  // Mutation limit: 10 req/min per IP (each refresh fans out to 10 upstream calls)
  const mutationLimiter = rateLimit({ ...limiterBase, max: 10 });

  // Note: mutation endpoints simultaneously consume both apiLimiter (120/min) and
  // mutationLimiter (10/min). RateLimit-* headers reflect only the mutationLimiter
  // because it runs last and overwrites the header. The apiLimiter budget is silently
  // consumed alongside it.
  app.use('/api', apiLimiter);
  // POST-only mutation limit: these endpoints fan out to 10 upstream HTTP calls each
  app.post('/api/locations', mutationLimiter);
  app.post('/api/locations/:locationId/refresh', mutationLimiter);
  app.post('/api/logs', mutationLimiter);

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
    const rawMetadata = request.body?.metadata;
    if (typeof event !== 'string' || !FRONTEND_EVENT_PATTERN.test(event)) {
      response.status(422).json({ detail: 'event is required' });
      return;
    }
    if (rawMetadata !== undefined) {
      if (typeof rawMetadata !== 'object' || rawMetadata === null || Array.isArray(rawMetadata)) {
        response.status(422).json({ detail: 'metadata must be a plain object' });
        return;
      }
      const isDeepObject = Object.values(rawMetadata as Record<string, unknown>).some(
        (v) => v !== null && typeof v === 'object',
      );
      if (isDeepObject) {
        response.status(422).json({ detail: 'metadata values must be primitives' });
        return;
      }
    }
    const metadata = rawMetadata
      ? Object.fromEntries(Object.entries(rawMetadata as Record<string, unknown>).slice(0, 10))
      : undefined;
    logger.info(
      {
        source: 'frontend',
        event,
        metadata,
        page:
          typeof request.body?.page === 'string'
            ? request.body.page
            : undefined,
      },
      'frontend interaction',
    );
    response.status(204).end();
  });

  app.use(sessionMiddleware);

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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseCookies(header: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of header.split(';')) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx < 1) continue;
    const key = pair.slice(0, eqIdx).trim();
    const value = pair.slice(eqIdx + 1).trim();
    if (key) result[key] = value;
  }
  return result;
}

function sessionMiddleware(
  request: express.Request,
  response: express.Response,
  next: express.NextFunction,
) {
  const cookies = parseCookies(request.headers.cookie ?? '');
  const existing = cookies.wsid;
  const sessionId = existing && UUID_RE.test(existing) ? existing : randomUUID();

  if (sessionId !== existing) {
    response.cookie('wsid', sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 365 * 24 * 60 * 60 * 1000,
    });
  }

  response.locals.sessionId = sessionId;
  next();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Wrapped in an async IIFE (not top-level await) so the module bundles to
  // CommonJS for the Netlify Functions bundler, which forbids top-level await.
  void (async () => {
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
  })();
}
