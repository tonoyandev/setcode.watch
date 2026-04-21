import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
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

  it('createPending returns a valid code and expiry', async () => {
    const { code, expiresAt } = await h.service.createPending({ eoa: ADDR_A });
    expect(code).toMatch(/^c_[A-Za-z0-9]{16}$/);
    expect(expiresAt.getTime() - new Date('2026-04-21T10:00:00Z').getTime()).toBe(300 * 1000);
  });

  it('confirm happy path moves pending to confirmed subscription', async () => {
    const { code } = await h.service.createPending({ eoa: ADDR_A });
    const result = await h.service.confirm({ code, chatId: 42n, username: 'alice' });
    expect(result).toEqual({ kind: 'ok', eoa: ADDR_A });

    const subs = await h.service.list(42n);
    expect(subs.map((s) => s.eoa)).toEqual([ADDR_A]);

    const pending = await h.db.select().from(schema.pendingConfirmations);
    expect(pending).toHaveLength(0);
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
    const { code } = await h.service.createPending({ eoa: ADDR_A });
    h.setNow(new Date('2026-04-21T10:10:00Z'));
    const result = await h.service.confirm({ code, chatId: 1n, username: null });
    expect(result).toEqual({ kind: 'expired' });

    const pending = await h.db.select().from(schema.pendingConfirmations);
    expect(pending).toHaveLength(0);
  });

  it('confirm returns already_subscribed when the chat already watches this EOA', async () => {
    const { code: code1 } = await h.service.createPending({ eoa: ADDR_A });
    await h.service.confirm({ code: code1, chatId: 1n, username: null });

    const { code: code2 } = await h.service.createPending({ eoa: ADDR_A });
    const result = await h.service.confirm({ code: code2, chatId: 1n, username: null });
    expect(result).toEqual({ kind: 'already_subscribed', eoa: ADDR_A });

    const subs = await h.service.list(1n);
    expect(subs).toHaveLength(1);
  });

  it('confirm enforces the soft cap per chat', async () => {
    const tight = await makeHarness({ maxSubscriptionsPerChat: 2 });
    try {
      for (const addr of [ADDR_A, ADDR_B]) {
        const { code } = await tight.service.createPending({ eoa: addr });
        await tight.service.confirm({ code, chatId: 7n, username: null });
      }
      const thirdAddr = `0x${'c'.repeat(40)}` as Address;
      const { code } = await tight.service.createPending({ eoa: thirdAddr });
      const result = await tight.service.confirm({ code, chatId: 7n, username: null });
      expect(result).toEqual({ kind: 'cap_reached', max: 2 });

      const subs = await tight.service.list(7n);
      expect(subs).toHaveLength(2);
    } finally {
      await tight.pg.close();
    }
  });

  it('permits the same EOA in different chats (many-to-many)', async () => {
    const { code: codeA } = await h.service.createPending({ eoa: ADDR_A });
    await h.service.confirm({ code: codeA, chatId: 1n, username: null });
    const { code: codeB } = await h.service.createPending({ eoa: ADDR_A });
    const result = await h.service.confirm({ code: codeB, chatId: 2n, username: null });
    expect(result).toEqual({ kind: 'ok', eoa: ADDR_A });

    const list1 = await h.service.list(1n);
    const list2 = await h.service.list(2n);
    expect(list1).toHaveLength(1);
    expect(list2).toHaveLength(1);
  });

  it('remove returns true on delete and false when nothing matched', async () => {
    const { code } = await h.service.createPending({ eoa: ADDR_A });
    await h.service.confirm({ code, chatId: 1n, username: null });
    expect(await h.service.remove({ eoa: ADDR_A, chatId: 1n })).toBe(true);
    expect(await h.service.list(1n)).toHaveLength(0);
    expect(await h.service.remove({ eoa: ADDR_A, chatId: 1n })).toBe(false);
  });

  it('sweepExpired deletes only rows past their expiry', async () => {
    await h.service.createPending({ eoa: ADDR_A });
    h.setNow(new Date('2026-04-21T10:06:00Z'));
    await h.service.createPending({ eoa: ADDR_B });

    const swept = await h.service.sweepExpired();
    expect(swept).toBe(1);
    const remaining = await h.db.select().from(schema.pendingConfirmations);
    expect(remaining.map((r) => r.eoa)).toEqual([ADDR_B]);
  });
});
