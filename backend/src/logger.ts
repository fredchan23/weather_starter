import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import pino from 'pino';

const isTest = process.env.NODE_ENV === 'test';
// Serverless platforms (e.g. Netlify Functions on AWS Lambda) have a read-only
// filesystem, so file logging is impossible there — log to stdout only, which the
// platform captures into its function logs.
const isServerless = Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);

const logPath =
  process.env.LOG_FILE_PATH ??
  join(process.cwd(), 'backend', 'logs', 'app.log');

function buildStream() {
  if (isTest) return undefined;
  const streams: pino.StreamEntry[] = [{ stream: process.stdout }];
  if (!isServerless) {
    try {
      mkdirSync(join(logPath, '..'), { recursive: true });
      streams.push({
        stream: pino.destination({ dest: logPath, sync: false }),
      });
    } catch {
      // Read-only filesystem (or similar): fall back to stdout-only logging.
    }
  }
  return pino.multistream(streams);
}

export const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? (isTest ? 'silent' : 'info'),
    base: {
      service: 'weather-starter',
    },
  },
  buildStream(),
);
