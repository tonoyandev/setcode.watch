import { defineConfig } from 'drizzle-kit';

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    '[setcode/watcher] DATABASE_URL is required for drizzle-kit. ' +
      'Set it in .env or pass inline, e.g. ' +
      'DATABASE_URL=postgres://setcode:setcode@localhost:5432/setcode pnpm db:generate',
  );
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './migrations',
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
