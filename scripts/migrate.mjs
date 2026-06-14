// Apply Drizzle migrations from backend/drizzle to the remote Turso (libSQL)
// database. Run with `npm run db:migrate:remote` (loads .env if present; on
// Netlify the TURSO_* vars come from the build environment instead).
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { join } from 'node:path';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  console.error('TURSO_DATABASE_URL is required to run remote migrations.');
  process.exit(1);
}

const migrationsFolder = join(process.cwd(), 'backend', 'drizzle');
const client = createClient({ url, authToken });
const db = drizzle(client);

console.log(`Applying migrations from ${migrationsFolder} -> ${new URL(url).host}`);
await migrate(db, { migrationsFolder });
console.log('Migrations applied.');
client.close();
