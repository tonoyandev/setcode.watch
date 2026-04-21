import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import type { Address } from 'viem';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Db, schema } from '../db/client.js';
import * as schemaModule from '../db/schema.js';
import { createClassificationService } from '../services/classification.js';
import { type DispatcherService, createDispatcherService } from '../services/dispatcher.js';
import type { SendOutcome, TelegramClient } from '../telegram/client.js';
import {
  insertDelegationEvent,
  installPonderFixture,
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

const EOA_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address;
const EOA_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address;
const TARGET_NEW = '0x1111111111111111111111111111111111111111' as Address;
const TARGET_OLD = '0x2222222222222222222222222222222222222222' as Address;
const TX_1 = `0x${'1'.repeat(64)}`;
const TX_2 = `0x${'2'.repeat(64)}`;

interface Harness {
  pg: PGlite;
  db: Db;
  service: DispatcherService;
  sends: { chatId: bigint; html: string }[];
  setSendResult: (fn: (input: { chatId: bigint; html: string }) => SendOutcome) => void;
}

async function makeHarness(
  opts: { sendResult?: (input: { chatId: bigint; html: string }) => SendOutcome } = {},
): Promise<Harness> {
  const pg = new PGlite();
  await installPonderFixture(pg);
  await pg.exec(loadMigrationSql());
  const db = drizzle(pg, { schema }) as unknown as Db;

  const sends: { chatId: bigint; html: string }[] = [];
  let sendResult = opts.sendResult ?? (() => ({ kind: 'ok' }) as SendOutcome);

  const telegram: TelegramClient = {
    async sendMessage(input) {
      sends.push(input);
      return sendResult(input);
    },
  };

  const classification = createClassificationService(db);

  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const service = createDispatcherService(
    { db, telegram, classification, logger },
    {
      batchSize: 100,
      retentionDays: 90,
      retentionBatchSize: 1000,
    },
  );

  return {
    pg,
    db,
    service,
    sends,
    setSendResult: (fn) => {
      sendResult = fn;
    },
  };
}

async function seedSubscription(pg: PGlite, eoa: Address, chatId: bigint): Promise<void> {
  await pg.query(
    `INSERT INTO subscriptions (eoa, telegram_chat_id, confirmed, confirmed_at)
     VALUES ($1, $2, true, NOW())`,
    [eoa, chatId.toString()],
  );
}

describe('DispatcherService', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await makeHarness();
  });

  afterEach(async () => {
    await h.pg.close();
  });

  it('initialises the cursor at head of delegation_event on first boot', async () => {
    await insertDelegationEvent(h.pg, {
      id: 'evt-1',
      eoa: EOA_A,
      previousTarget: null,
      newTarget: TARGET_NEW,
      chainId: 1,
      blockNumber: 100n,
      timestamp: 1000n,
      txHash: TX_1,
    });

    await h.service.initialiseCursorIfMissing();
    const cursor = await h.service.readCursor();
    expect(cursor).toEqual({ lastBlock: 100n, lastId: 'evt-1' });
  });

  it('does not fan out events that pre-date cursor initialisation', async () => {
    await seedSubscription(h.pg, EOA_A, 42n);
    await insertDelegationEvent(h.pg, {
      id: 'evt-1',
      eoa: EOA_A,
      previousTarget: null,
      newTarget: TARGET_NEW,
      chainId: 1,
      blockNumber: 100n,
      timestamp: 1000n,
      txHash: TX_1,
    });

    await h.service.initialiseCursorIfMissing();
    const result = await h.service.processBatch();
    expect(result.events).toBe(0);
    expect(h.sends).toEqual([]);
  });

  it('fans out a post-cursor event to every confirmed subscriber', async () => {
    await h.service.initialiseCursorIfMissing(); // cursor at genesis, no events yet
    await seedSubscription(h.pg, EOA_A, 1n);
    await seedSubscription(h.pg, EOA_A, 2n);
    await insertDelegationEvent(h.pg, {
      id: 'evt-1',
      eoa: EOA_A,
      previousTarget: null,
      newTarget: TARGET_NEW,
      chainId: 1,
      blockNumber: 100n,
      timestamp: 1000n,
      txHash: TX_1,
    });

    const result = await h.service.processBatch();
    expect(result.events).toBe(1);
    expect(result.sent).toBe(2);
    expect(h.sends.map((s) => s.chatId).sort()).toEqual([1n, 2n]);

    const alerts = await h.db.select().from(schemaModule.alertsSent);
    expect(alerts).toHaveLength(2);
    const cursor = await h.service.readCursor();
    expect(cursor).toEqual({ lastBlock: 100n, lastId: 'evt-1' });
  });

  it('advances the cursor even when no subscribers are interested', async () => {
    await h.service.initialiseCursorIfMissing();
    await insertDelegationEvent(h.pg, {
      id: 'evt-1',
      eoa: EOA_B,
      previousTarget: null,
      newTarget: TARGET_NEW,
      chainId: 1,
      blockNumber: 100n,
      timestamp: 1000n,
      txHash: TX_1,
    });

    const result = await h.service.processBatch();
    expect(result.events).toBe(1);
    expect(result.sent).toBe(0);
    expect(h.sends).toEqual([]);

    const cursor = await h.service.readCursor();
    expect(cursor).toEqual({ lastBlock: 100n, lastId: 'evt-1' });
  });

  it('stops advancing on a transient send failure and retries on the next tick', async () => {
    await h.service.initialiseCursorIfMissing();
    await seedSubscription(h.pg, EOA_A, 1n);
    await insertDelegationEvent(h.pg, {
      id: 'evt-1',
      eoa: EOA_A,
      previousTarget: null,
      newTarget: TARGET_NEW,
      chainId: 1,
      blockNumber: 100n,
      timestamp: 1000n,
      txHash: TX_1,
    });

    let calls = 0;
    h.setSendResult(() => {
      calls += 1;
      return calls === 1 ? { kind: 'transient', reason: 'rate limited' } : { kind: 'ok' };
    });

    const first = await h.service.processBatch();
    expect(first.transientFailures).toBe(1);
    expect(first.sent).toBe(0);
    expect(first.advanced).toBe(false);
    // cursor should not have advanced
    const cursorAfter1 = await h.service.readCursor();
    expect(cursorAfter1).toEqual({ lastBlock: 0n, lastId: '' });

    const second = await h.service.processBatch();
    expect(second.sent).toBe(1);
    expect(second.advanced).toBe(true);
    const cursorAfter2 = await h.service.readCursor();
    expect(cursorAfter2).toEqual({ lastBlock: 100n, lastId: 'evt-1' });
  });

  it('treats permanent failures as handled and advances past the event', async () => {
    await h.service.initialiseCursorIfMissing();
    await seedSubscription(h.pg, EOA_A, 1n);
    await insertDelegationEvent(h.pg, {
      id: 'evt-1',
      eoa: EOA_A,
      previousTarget: null,
      newTarget: TARGET_NEW,
      chainId: 1,
      blockNumber: 100n,
      timestamp: 1000n,
      txHash: TX_1,
    });

    h.setSendResult(() => ({ kind: 'permanent', reason: 'blocked by user' }));

    const result = await h.service.processBatch();
    expect(result.permanentFailures).toBe(1);
    expect(result.advanced).toBe(true);
    const alerts = await h.db.select().from(schemaModule.alertsSent);
    expect(alerts).toHaveLength(0);
    const cursor = await h.service.readCursor();
    expect(cursor).toEqual({ lastBlock: 100n, lastId: 'evt-1' });
  });

  it('skips chats already alerted for the same tx (idempotent replay)', async () => {
    await h.service.initialiseCursorIfMissing();
    await seedSubscription(h.pg, EOA_A, 1n);
    await seedSubscription(h.pg, EOA_A, 2n);
    await insertDelegationEvent(h.pg, {
      id: 'evt-1',
      eoa: EOA_A,
      previousTarget: null,
      newTarget: TARGET_NEW,
      chainId: 1,
      blockNumber: 100n,
      timestamp: 1000n,
      txHash: TX_1,
    });

    // First pass: chat 1 fails transiently, chat 2 succeeds
    let seen = 0;
    h.setSendResult((input) => {
      seen += 1;
      if (input.chatId === 1n && seen === 1) {
        return { kind: 'transient', reason: 'flaky' };
      }
      return { kind: 'ok' };
    });
    await h.service.processBatch();
    expect(h.sends.length).toBe(2);

    // Second pass: chat 2 has been logged; we should only re-attempt chat 1
    h.sends.length = 0;
    h.setSendResult(() => ({ kind: 'ok' }));
    await h.service.processBatch();
    expect(h.sends.length).toBe(1);
    expect(h.sends[0]?.chatId).toBe(1n);
  });

  it('orders events by (block_number, id) across multiple events', async () => {
    await h.service.initialiseCursorIfMissing();
    await seedSubscription(h.pg, EOA_A, 1n);
    await insertDelegationEvent(h.pg, {
      id: 'evt-2',
      eoa: EOA_A,
      previousTarget: null,
      newTarget: TARGET_NEW,
      chainId: 1,
      blockNumber: 101n,
      timestamp: 1001n,
      txHash: TX_2,
    });
    await insertDelegationEvent(h.pg, {
      id: 'evt-1',
      eoa: EOA_A,
      previousTarget: null,
      newTarget: TARGET_OLD,
      chainId: 1,
      blockNumber: 100n,
      timestamp: 1000n,
      txHash: TX_1,
    });

    const result = await h.service.processBatch();
    expect(result.events).toBe(2);
    expect(result.sent).toBe(2);
    const cursor = await h.service.readCursor();
    expect(cursor).toEqual({ lastBlock: 101n, lastId: 'evt-2' });
  });

  it('resolves classifications via on-chain state and embeds them in the alert', async () => {
    await h.service.initialiseCursorIfMissing();
    await seedSubscription(h.pg, EOA_A, 1n);
    await upsertRegistryClassification(h.pg, {
      target: TARGET_NEW,
      current: 'Malicious',
      reason: 'flagged',
      updatedAt: 42n,
    });
    await insertDelegationEvent(h.pg, {
      id: 'evt-1',
      eoa: EOA_A,
      previousTarget: null,
      newTarget: TARGET_NEW,
      chainId: 1,
      blockNumber: 100n,
      timestamp: 1000n,
      txHash: TX_1,
    });

    await h.service.processBatch();
    expect(h.sends[0]?.html).toMatch(/Malicious delegation detected/);
    expect(h.sends[0]?.html).toContain(TARGET_NEW);
    expect(h.sends[0]?.html).toMatch(/malicious/);
  });
});

describe('DispatcherService.runRetentionSweep', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await makeHarness();
  });

  afterEach(async () => {
    await h.pg.close();
  });

  it('deletes rows older than retentionDays in batches and leaves newer rows intact', async () => {
    await h.service.initialiseCursorIfMissing();
    const oldSent = new Date(Date.now() - 120 * 86_400_000);
    const recentSent = new Date(Date.now() - 1 * 86_400_000);

    const insert = async (txHash: string, chatId: bigint, sentAt: Date) => {
      await h.pg.query(
        `INSERT INTO alerts_sent (eoa, telegram_chat_id, tx_hash, old_classification, new_classification, chain_id, block_number, sent_at)
         VALUES ($1, $2, $3, 'unknown', 'unknown', 1, 100, $4)`,
        [EOA_A, chatId.toString(), txHash, sentAt.toISOString()],
      );
    };
    await insert(`0x${'a'.repeat(64)}`, 1n, oldSent);
    await insert(`0x${'b'.repeat(64)}`, 2n, oldSent);
    await insert(`0x${'c'.repeat(64)}`, 3n, recentSent);

    const result = await h.service.runRetentionSweep();
    expect(result.deleted).toBe(2);
    const remaining = await h.db.select().from(schemaModule.alertsSent);
    expect(remaining).toHaveLength(1);
  });
});
