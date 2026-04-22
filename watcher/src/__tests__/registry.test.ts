import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Db, schema } from '../db/client.js';
import { createRegistryService } from '../services/registry.js';
import { installPonderFixture, upsertRegistryClassification } from './_ponder-fixture.js';

const MIGRATIONS_DIR = join(process.cwd(), 'migrations');

function loadMigrationSql(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf8'))
    .join('\n');
}

describe('RegistryService', () => {
  let pg: PGlite;
  let db: Db;

  beforeEach(async () => {
    pg = new PGlite();
    await installPonderFixture(pg);
    await pg.exec(loadMigrationSql());
    db = drizzle(pg, { schema }) as unknown as Db;
  });

  afterEach(async () => {
    await pg.close();
  });

  it('lists rows sorted by lastClassifiedAt descending', async () => {
    await upsertRegistryClassification(pg, {
      target: '0x0000000000000000000000000000000000000001',
      current: 'Verified',
      reason: 'known safe',
      updatedAt: 10n,
    });
    await upsertRegistryClassification(pg, {
      target: '0x0000000000000000000000000000000000000002',
      current: 'Malicious',
      reason: 'drainer',
      updatedAt: 20n,
    });

    const result = await createRegistryService(db, { defaultLimit: 10 }).list();
    expect(result.nextCursor).toBeNull();
    expect(result.entries.map((e) => e.target)).toEqual([
      '0x0000000000000000000000000000000000000002',
      '0x0000000000000000000000000000000000000001',
    ]);
    expect(result.entries[0]).toEqual({
      target: '0x0000000000000000000000000000000000000002',
      classification: 'malicious',
      reason: 'drainer',
      lastClassifiedAt: 20,
    });
  });

  it('filters by classification and paginates with cursor', async () => {
    await upsertRegistryClassification(pg, {
      target: '0x0000000000000000000000000000000000000010',
      current: 'Verified',
      reason: 'A',
      updatedAt: 30n,
    });
    await upsertRegistryClassification(pg, {
      target: '0x0000000000000000000000000000000000000011',
      current: 'Verified',
      reason: 'B',
      updatedAt: 20n,
    });
    await upsertRegistryClassification(pg, {
      target: '0x0000000000000000000000000000000000000012',
      current: 'Verified',
      reason: 'C',
      updatedAt: 10n,
    });
    await upsertRegistryClassification(pg, {
      target: '0x0000000000000000000000000000000000000013',
      current: 'Malicious',
      reason: 'D',
      updatedAt: 40n,
    });

    const service = createRegistryService(db, { defaultLimit: 2 });
    const first = await service.list({ classification: 'verified' });
    expect(first.entries).toHaveLength(2);
    expect(first.entries.map((e) => e.reason)).toEqual(['A', 'B']);
    expect(first.nextCursor).toBe(2);

    const second = await service.list({
      classification: 'verified',
      cursor: first.nextCursor ?? 0,
    });
    expect(second.entries).toHaveLength(1);
    expect(second.entries[0]?.reason).toBe('C');
    expect(second.nextCursor).toBeNull();
  });
});
