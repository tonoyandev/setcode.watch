import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import {
  CHAIN_ID_ARBITRUM,
  CHAIN_ID_BASE,
  CHAIN_ID_MAINNET,
  CHAIN_ID_OPTIMISM,
} from '@setcode/shared';
import { drizzle } from 'drizzle-orm/pglite';
import type { Address } from 'viem';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../db/schema.js';
import { newConfirmationCode } from '../lib/code.js';
import {
  type ConfirmationsService,
  type WatcherDb,
  createConfirmationsService,
} from '../services/confirmations.js';

const MIGRATIONS_DIR = join(process.cwd(), 'migrations');

function loadMigrationSql(): string {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  return files.map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf8')).join('\n');
}

const ADDR_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address;
const ADDR_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address;
const ALL_CHAINS = [CHAIN_ID_MAINNET, CHAIN_ID_OPTIMISM, CHAIN_ID_BASE, CHAIN_ID_ARBITRUM];

interface Harness {
  pg: PGlite;
  db: WatcherDb;
  service: ConfirmationsService;
  setNow: (d: Date) => void;
}

async function makeHarness(
  opts: { maxSubscriptionsPerChat?: number; ttlSeconds?: number } = {},
): Promise<Harness> {
  const pg = new PGlite();
  await pg.exec(loadMigrationSql());
  const db = drizzle(pg, { schema }) as unknown as WatcherDb;

  let now = new Date('2026-04-21T10:00:00Z');
  const service = createConfirmationsService(db, {
    confirmationTtlSeconds: opts.ttlSeconds ?? 300,
    maxSubscriptionsPerChat: opts.maxSubscriptionsPerChat ?? 10,
    now: () => now,
  });

  return {
    pg,
    db,
    service,
    setNow: (d) => {
      now = d;
    },
  };
}

describe('ConfirmationsService', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await makeHarness();
  });

  afterEach(async () => {
    await h.pg.close();
  });

  it('createPending stores the requested chain set on the pending row', async () => {
    const { code, expiresAt } = await h.service.createPending({
      eoa: ADDR_A,
      chainIds: ALL_CHAINS,
    });
    expect(code).toMatch(/^c_[A-Za-z0-9]{16}$/);
    expect(expiresAt.getTime() - new Date('2026-04-21T10:00:00Z').getTime()).toBe(300 * 1000);

    const [row] = await h.db.select().from(schema.pendingConfirmations);
    expect(row?.chainIds).toEqual(ALL_CHAINS);
  });

  it('createPending dedupes the chain set so duplicates do not fan out twice', async () => {
    const { code } = await h.service.createPending({
      eoa: ADDR_A,
      chainIds: [CHAIN_ID_MAINNET, CHAIN_ID_MAINNET, CHAIN_ID_BASE],
    });
    const result = await h.service.confirm({ code, chatId: 1n, username: null });
    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.addedChainIds.sort()).toEqual([CHAIN_ID_MAINNET, CHAIN_ID_BASE].sort());
  });

  it('createPending rejects an empty chain set', async () => {
    await expect(h.service.createPending({ eoa: ADDR_A, chainIds: [] })).rejects.toThrow();
  });

  it('confirm with all-chain pending fans out into one subscription per chain', async () => {
    const { code } = await h.service.createPending({ eoa: ADDR_A, chainIds: ALL_CHAINS });
    const result = await h.service.confirm({ code, chatId: 42n, username: 'alice' });
    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.eoa).toBe(ADDR_A);
    expect(result.addedChainIds.sort()).toEqual([...ALL_CHAINS].sort());
    expect(result.alreadyChainIds).toEqual([]);

    const subs = await h.service.list(42n);
    expect(subs.map((s) => s.chainId).sort()).toEqual([...ALL_CHAINS].sort());

    const pending = await h.db.select().from(schema.pendingConfirmations);
    expect(pending).toHaveLength(0);
  });

  it('confirm splits added vs already-subscribed when the chat partially overlaps', async () => {
    // Pre-existing: chat is already watching ADDR_A on Ethereum.
    const { code: c1 } = await h.service.createPending({
      eoa: ADDR_A,
      chainIds: [CHAIN_ID_MAINNET],
    });
    await h.service.confirm({ code: c1, chatId: 9n, username: null });

    // Bell-flow: ask for all four chains; only the three new ones get added.
    const { code: c2 } = await h.service.createPending({
      eoa: ADDR_A,
      chainIds: ALL_CHAINS,
    });
    const result = await h.service.confirm({ code: c2, chatId: 9n, username: null });
    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.addedChainIds.sort()).toEqual(
      [CHAIN_ID_OPTIMISM, CHAIN_ID_BASE, CHAIN_ID_ARBITRUM].sort(),
    );
    expect(result.alreadyChainIds).toEqual([CHAIN_ID_MAINNET]);

    const subs = await h.service.list(9n);
    expect(subs.map((s) => s.chainId).sort()).toEqual([...ALL_CHAINS].sort());
  });

  it('confirm returns already_subscribed when every requested chain is already covered', async () => {
    const { code: c1 } = await h.service.createPending({ eoa: ADDR_A, chainIds: ALL_CHAINS });
    await h.service.confirm({ code: c1, chatId: 1n, username: null });

    const { code: c2 } = await h.service.createPending({ eoa: ADDR_A, chainIds: ALL_CHAINS });
    const result = await h.service.confirm({ code: c2, chatId: 1n, username: null });
    expect(result.kind).toBe('already_subscribed');
    if (result.kind === 'already_subscribed') {
      expect(result.eoa).toBe(ADDR_A);
      expect(result.chainIds.sort()).toEqual([...ALL_CHAINS].sort());
    }
    const subs = await h.service.list(1n);
    expect(subs).toHaveLength(ALL_CHAINS.length);
  });

  it('confirm returns not_found for an unknown code', async () => {
    const result = await h.service.confirm({
      code: newConfirmationCode(),
      chatId: 1n,
      username: null,
    });
    expect(result).toEqual({ kind: 'not_found' });
  });

  it('confirm returns expired and deletes the row when TTL elapsed', async () => {
    const { code } = await h.service.createPending({ eoa: ADDR_A, chainIds: ALL_CHAINS });
    h.setNow(new Date('2026-04-21T10:10:00Z'));
    const result = await h.service.confirm({ code, chatId: 1n, username: null });
    expect(result).toEqual({ kind: 'expired' });

    const pending = await h.db.select().from(schema.pendingConfirmations);
    expect(pending).toHaveLength(0);
  });

  it('cap counts distinct EOAs (subscribing to one EOA on all chains is one slot)', async () => {
    const tight = await makeHarness({ maxSubscriptionsPerChat: 2 });
    try {
      // Slot 1: ADDR_A on all four chains (one EOA → one slot).
      const { code: c1 } = await tight.service.createPending({
        eoa: ADDR_A,
        chainIds: ALL_CHAINS,
      });
      const r1 = await tight.service.confirm({ code: c1, chatId: 7n, username: null });
      expect(r1.kind).toBe('ok');
      // Slot 2: ADDR_B on all four chains (still under cap).
      const { code: c2 } = await tight.service.createPending({
        eoa: ADDR_B,
        chainIds: ALL_CHAINS,
      });
      const r2 = await tight.service.confirm({ code: c2, chatId: 7n, username: null });
      expect(r2.kind).toBe('ok');
      // Slot 3 would tip past the cap.
      const thirdAddr = `0x${'c'.repeat(40)}` as Address;
      const { code: c3 } = await tight.service.createPending({
        eoa: thirdAddr,
        chainIds: ALL_CHAINS,
      });
      const r3 = await tight.service.confirm({ code: c3, chatId: 7n, username: null });
      expect(r3).toEqual({ kind: 'cap_reached', max: 2 });

      const subs = await tight.service.list(7n);
      expect(new Set(subs.map((s) => s.eoa)).size).toBe(2);
    } finally {
      await tight.pg.close();
    }
  });

  it('permits the same EOA in different chats (many-to-many)', async () => {
    const { code: codeA } = await h.service.createPending({
      eoa: ADDR_A,
      chainIds: [CHAIN_ID_MAINNET],
    });
    await h.service.confirm({ code: codeA, chatId: 1n, username: null });
    const { code: codeB } = await h.service.createPending({
      eoa: ADDR_A,
      chainIds: [CHAIN_ID_MAINNET],
    });
    const result = await h.service.confirm({ code: codeB, chatId: 2n, username: null });
    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.addedChainIds).toEqual([CHAIN_ID_MAINNET]);

    expect(await h.service.list(1n)).toHaveLength(1);
    expect(await h.service.list(2n)).toHaveLength(1);
  });

  it('remove still operates on a single (eoa, chainId) tuple', async () => {
    const { code } = await h.service.createPending({ eoa: ADDR_A, chainIds: ALL_CHAINS });
    await h.service.confirm({ code, chatId: 1n, username: null });
    // Remove just Optimism.
    expect(await h.service.remove({ eoa: ADDR_A, chainId: CHAIN_ID_OPTIMISM, chatId: 1n })).toBe(
      true,
    );
    const subs = await h.service.list(1n);
    expect(subs.map((s) => s.chainId).sort()).toEqual(
      [CHAIN_ID_MAINNET, CHAIN_ID_BASE, CHAIN_ID_ARBITRUM].sort(),
    );
    // No matching row → false.
    expect(await h.service.remove({ eoa: ADDR_A, chainId: CHAIN_ID_OPTIMISM, chatId: 1n })).toBe(
      false,
    );
  });

  it('sweepExpired deletes only rows past their expiry', async () => {
    await h.service.createPending({ eoa: ADDR_A, chainIds: ALL_CHAINS });
    h.setNow(new Date('2026-04-21T10:06:00Z'));
    await h.service.createPending({ eoa: ADDR_B, chainIds: ALL_CHAINS });

    const swept = await h.service.sweepExpired();
    expect(swept).toBe(1);
    const remaining = await h.db.select().from(schema.pendingConfirmations);
    expect(remaining.map((r) => r.eoa)).toEqual([ADDR_B]);
  });
});
