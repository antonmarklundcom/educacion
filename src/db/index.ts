/**
 * The single MySQL pool for the whole app.
 *
 * Hostinger's MySQL allows a modest number of concurrent connections and the
 * app runs as one Node instance, so the pool is deliberately small
 * (`connectionLimit: 8`). Raising it does not make the site faster; it makes
 * `Too many connections` a production incident.
 *
 * `timezone: "Z"` makes mysql2 read and write DATETIME/TIMESTAMP as UTC
 * regardless of the server's session timezone. Everything is stored UTC and
 * rendered in `America/Asuncion` at the edge of the app (data-model.md §3).
 */

import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';

import * as schema from './schema';

export const POOL_CONFIG = {
  connectionLimit: 8,
  waitForConnections: true,
  queueLimit: 24,
  connectTimeout: 8_000,
  timezone: 'Z',
  /** Guaraní amounts are integers; never let the driver hand us a string. */
  supportBigNumbers: true,
  bigNumberStrings: false,
  dateStrings: false,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10_000,
} as const;

function connectionUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // mysql2 silently falls back to localhost when the URL is missing, which
    // produces a confusing ECONNREFUSED. tsx does not auto-load .env — see
    // docs/deployment.md §5.
    throw new Error(
      'DATABASE_URL is not set. Scripts run via tsx do not load .env automatically — ' +
        'export it in the shell first (docs/deployment.md §5).',
    );
  }
  return url;
}

/**
 * Create a pool. Used by the app (via the shared `db` below) and by scripts
 * that need to close their pool explicitly when they finish.
 */
export function createPool(url: string = connectionUrl()) {
  return mysql.createPool({ uri: url, ...POOL_CONFIG });
}

export function createDb(pool: mysql.Pool) {
  return drizzle(pool, { schema, mode: 'default' });
}

// Next.js dev reloads the module graph; without this the pool count grows on
// every hot reload until MySQL refuses connections.
const globalForDb = globalThis as unknown as {
  __educacionPool?: mysql.Pool;
  __educacionDb?: ReturnType<typeof createDb>;
};

function sharedDb(): ReturnType<typeof createDb> {
  if (!globalForDb.__educacionDb) {
    globalForDb.__educacionPool ??= createPool();
    globalForDb.__educacionDb = createDb(globalForDb.__educacionPool);
  }
  return globalForDb.__educacionDb;
}

/** Lazily connected — importing this module must not require a database. */
export const db = new Proxy({} as ReturnType<typeof createDb>, {
  get: (_target, prop, receiver) => Reflect.get(sharedDb(), prop, receiver),
}) as ReturnType<typeof createDb>;

export { schema };
export type Db = ReturnType<typeof createDb>;
