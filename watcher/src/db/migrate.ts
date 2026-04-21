import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { requireDatabaseUrl } from '../lib/env.js';

async function main() {
  const url = requireDatabaseUrl();
  const client = postgres(url, { max: 1, prepare: false });
  const db = drizzle(client);

  console.log('[setcode/watcher] running migrations…');
  await migrate(db, { migrationsFolder: 'migrations' });
  console.log('[setcode/watcher] migrations complete.');

  await client.end({ timeout: 5 });
}

main().catch((err) => {
  console.error('[setcode/watcher] migration failed:', err);
  process.exit(1);
});
