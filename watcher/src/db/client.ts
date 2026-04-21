import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { requireDatabaseUrl } from '../lib/env.js';
import * as schema from './schema.js';

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
