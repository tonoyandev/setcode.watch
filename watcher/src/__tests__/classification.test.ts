import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import type { Address } from 'viem';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Db, schema } from '../db/client.js';
import { createClassificationService } from '../services/classification.js';
import { installPonderFixture, upsertRegistryClassification } from './_ponder-fixture.js';

const MIGRATIONS_DIR = join(process.cwd(), 'migrations');

function loadMigrationSql(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf8'))
    .join('\n');
}

// A known-verified address from shared/src/registry.json would be ideal, but
// tests should not be coupled to that file's contents. These are fabricated
// targets whose classifications we drive through the on-chain table directly.
const VERIFIED = '0x1111111111111111111111111111111111111111' as Address;
const MALICIOUS = '0x2222222222222222222222222222222222222222' as Address;
const UNKNOWN = '0x3333333333333333333333333333333333333333' as Address;

describe('ClassificationService', () => {
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

  it('returns unknown for a null target', async () => {
    const svc = createClassificationService(db);
    expect(await svc.resolve(null)).toBe('unknown');
  });

  it('resolves on-chain classifications when present', async () => {
    await upsertRegistryClassification(pg, {
      target: VERIFIED,
      current: 'Verified',
      reason: 'test',
      updatedAt: 1n,
    });
    await upsertRegistryClassification(pg, {
      target: MALICIOUS,
      current: 'Malicious',
      reason: 'test',
      updatedAt: 2n,
    });
    const svc = createClassificationService(db);
    expect(await svc.resolve(VERIFIED)).toBe('verified');
    expect(await svc.resolve(MALICIOUS)).toBe('malicious');
  });

  it('falls back to unknown for targets absent from both on-chain and static registries', async () => {
    const svc = createClassificationService(db);
    expect(await svc.resolve(UNKNOWN)).toBe('unknown');
  });

  it('resolveMany returns a map keyed by lower-cased address', async () => {
    await upsertRegistryClassification(pg, {
      target: VERIFIED,
      current: 'Verified',
      reason: 'test',
      updatedAt: 1n,
    });
    const svc = createClassificationService(db);
    const out = await svc.resolveMany([VERIFIED, UNKNOWN, null]);
    expect(out.get(VERIFIED.toLowerCase())).toBe('verified');
    expect(out.get(UNKNOWN.toLowerCase())).toBe('unknown');
  });
});
