import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { requireDatabaseUrl } from '../lib/env.js';
import * as ponderReadSchema from './ponder-read.js';
import * as watcherSchema from './schema.js';

// Merged schema: the dispatcher reads Ponder-owned tables alongside the
// watcher's own. Handlers that only touch watcher tables (confirmations,
// HTTP API) do not see a functional difference — drizzle just knows about
// extra tables they never query.
export const schema = { ...watcherSchema, ...ponderReadSchema };
export type Schema = typeof schema;
export type Db = PgDatabase<PgQueryResultHKT, Schema>;

export type Database = ReturnType<typeof createDatabase>;

export function createDatabase(url: string = requireDatabaseUrl()) {
  const client = postgres(url, {
    prepare: false,
    onnotice: () => undefined,
  });
  const db = drizzle(client, { schema });
  return Object.assign(db, {
    async close() {
      await client.end({ timeout: 5 });
    },
  });
}
