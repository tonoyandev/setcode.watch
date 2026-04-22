import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { CHAIN_ID_MAINNET } from '@setcode/shared/constants';
import { drizzle } from 'drizzle-orm/pglite';
import type { Address } from 'viem';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Db, schema } from '../db/client.js';
import { createCheckService } from '../services/check.js';
import { createClassificationService } from '../services/classification.js';
import {
  installPonderFixture,
  upsertDelegationState,
  upsertRegistryClassification,
} from './_ponder-fixture.js';

const MIGRATIONS_DIR = join(process.cwd(), 'migrations');

function loadMigrationSql(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf8'))
    .join('\n');
}

const EOA = '0xabcdef0123456789abcdef0123456789abcdef01' as Address;
const TARGET_MALICIOUS = '0x2222222222222222222222222222222222222222' as Address;

describe('CheckService', () => {
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

  function service() {
    return createCheckService(db, {
      chainId: CHAIN_ID_MAINNET,
      classification: createClassificationService(db),
    });
  }

  it('returns unknown/source=unknown when no delegation row exists', async () => {
    const result = await service().check(EOA);
    expect(result).toEqual({
      eoa: EOA.toLowerCase(),
      chainId: CHAIN_ID_MAINNET,
      currentTarget: null,
      classification: 'unknown',
      source: 'unknown',
      lastUpdated: null,
    });
  });

  it('returns unknown when the EOA revoked its delegation (currentTarget=null)', async () => {
    await upsertDelegationState(pg, {
      eoa: EOA,
      chainId: CHAIN_ID_MAINNET,
      currentTarget: null,
      lastUpdated: 42n,
    });
    const result = await service().check(EOA);
    expect(result.classification).toBe('unknown');
    expect(result.source).toBe('unknown');
    expect(result.currentTarget).toBeNull();
    expect(result.lastUpdated).toBe(42);
  });

  it('flags source=registry when the on-chain registry has an explicit record', async () => {
    await upsertDelegationState(pg, {
      eoa: EOA,
      chainId: CHAIN_ID_MAINNET,
      currentTarget: TARGET_MALICIOUS,
      lastUpdated: 100n,
    });
    await upsertRegistryClassification(pg, {
      target: TARGET_MALICIOUS,
      current: 'Malicious',
      reason: 'known drainer',
      updatedAt: 99n,
    });
    const result = await service().check(EOA);
    expect(result.currentTarget).toBe(TARGET_MALICIOUS.toLowerCase());
    expect(result.classification).toBe('malicious');
    expect(result.source).toBe('registry');
    expect(result.lastUpdated).toBe(100);
  });

  it('flags source=unknown when the target has no record in either registry', async () => {
    await upsertDelegationState(pg, {
      eoa: EOA,
      chainId: CHAIN_ID_MAINNET,
      currentTarget: '0x9999999999999999999999999999999999999999',
      lastUpdated: 7n,
    });
    const result = await service().check(EOA);
    expect(result.classification).toBe('unknown');
    expect(result.source).toBe('unknown');
  });
});
