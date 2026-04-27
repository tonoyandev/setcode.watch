import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { CHAIN_ID_MAINNET } from '@setcode/shared';
import { drizzle } from 'drizzle-orm/pglite';
import type { Address } from 'viem';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/client.js';
import * as schema from '../db/schema.js';
import {
  type ConfirmationsService,
  createConfirmationsService,
} from '../services/confirmations.js';
import { type ManageService, createManageService } from '../services/manage.js';

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
  db: Db;
  confirmations: ConfirmationsService;
  manage: ManageService;
  tokens: string[];
}

async function makeHarness(): Promise<Harness> {
  const pg = new PGlite();
  await pg.exec(loadMigrationSql());
  const db = drizzle(pg, { schema }) as unknown as Db;

  const confirmations = createConfirmationsService(db, {
    confirmationTtlSeconds: 300,
    maxSubscriptionsPerChat: 10,
    now: () => new Date('2026-04-21T10:00:00Z'),
  });

  const tokens: string[] = [];
  let counter = 0;
  const manage = createManageService(db, {
    webBaseUrl: 'https://setcode.watch',
    newToken: () => {
      const t = `tok_${++counter}`;
      tokens.push(t);
      return t;
    },
    now: () => new Date('2026-04-21T10:00:00Z'),
  });

  return { pg, db, confirmations, manage, tokens };
}

async function subscribe(
  h: Harness,
  eoa: Address,
  chatId: bigint,
  chainId = CHAIN_ID_MAINNET,
): Promise<void> {
  const { code } = await h.confirmations.createPending({ eoa, chainId });
  await h.confirmations.confirm({ code, chatId, username: null });
}

describe('ManageService', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await makeHarness();
  });

  afterEach(async () => {
    await h.pg.close();
  });

  it('issue returns a url built from webBaseUrl and the new token', async () => {
    const res = await h.manage.issue(42n);
    expect(res.token).toBe('tok_1');
    expect(res.url).toBe('https://setcode.watch/manage/tok_1');
  });

  it('issuing a second token revokes the first for the same chat', async () => {
    const first = await h.manage.issue(42n);
    const second = await h.manage.issue(42n);
    expect(first.token).not.toBe(second.token);
    expect(await h.manage.resolve(first.token)).toBeNull();
    expect(await h.manage.resolve(second.token)).toBe(42n);
  });

  it('issue does not revoke tokens for other chats', async () => {
    const a = await h.manage.issue(1n);
    const b = await h.manage.issue(2n);
    expect(await h.manage.resolve(a.token)).toBe(1n);
    expect(await h.manage.resolve(b.token)).toBe(2n);
  });

  it('listSubscriptions returns not_found for an unknown token', async () => {
    const result = await h.manage.listSubscriptions('no-such-token');
    expect(result).toEqual({ kind: 'not_found' });
  });

  it('listSubscriptions returns the confirmed EOAs of the chat', async () => {
    await subscribe(h, ADDR_A, 42n);
    await subscribe(h, ADDR_B, 42n);
    await subscribe(h, ADDR_A, 99n); // different chat, must not leak
    const { token } = await h.manage.issue(42n);

    const result = await h.manage.listSubscriptions(token);
    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.chatId).toBe(42n);
    expect(result.subscriptions.map((s) => s.eoa).sort()).toEqual([ADDR_A, ADDR_B]);
  });

  it('removeSubscription deletes only the caller chat row', async () => {
    await subscribe(h, ADDR_A, 42n);
    await subscribe(h, ADDR_A, 99n);
    const { token } = await h.manage.issue(42n);

    const result = await h.manage.removeSubscription(token, ADDR_A, CHAIN_ID_MAINNET);
    expect(result).toEqual({ kind: 'ok', removed: true });

    const list42 = await h.confirmations.list(42n);
    const list99 = await h.confirmations.list(99n);
    expect(list42).toHaveLength(0);
    expect(list99.map((s) => s.eoa)).toEqual([ADDR_A]);
  });

  it('removeSubscription returns ok/removed=false when nothing matched', async () => {
    const { token } = await h.manage.issue(42n);
    const result = await h.manage.removeSubscription(token, ADDR_A, CHAIN_ID_MAINNET);
    expect(result).toEqual({ kind: 'ok', removed: false });
  });

  it('removeSubscription returns not_found for a revoked token', async () => {
    const first = await h.manage.issue(42n);
    await h.manage.issue(42n); // rotates, revokes first
    const result = await h.manage.removeSubscription(first.token, ADDR_A, CHAIN_ID_MAINNET);
    expect(result).toEqual({ kind: 'not_found' });
  });

  it('removeSubscription leaves the same EOA on a different chain intact', async () => {
    await subscribe(h, ADDR_A, 42n, 1); // mainnet
    await subscribe(h, ADDR_A, 42n, 8453); // base
    const { token } = await h.manage.issue(42n);

    const result = await h.manage.removeSubscription(token, ADDR_A, 1);
    expect(result).toEqual({ kind: 'ok', removed: true });

    const list42 = await h.confirmations.list(42n);
    expect(list42).toHaveLength(1);
    expect(list42[0]?.chainId).toBe(8453);
  });

  it('revoke flips active tokens and returns false when already revoked', async () => {
    const { token } = await h.manage.issue(42n);
    expect(await h.manage.revoke(token)).toBe(true);
    expect(await h.manage.resolve(token)).toBeNull();
    expect(await h.manage.revoke(token)).toBe(false);
  });

  it('urlFor strips trailing slashes in webBaseUrl', async () => {
    const pg = new PGlite();
    await pg.exec(loadMigrationSql());
    const db = drizzle(pg, { schema }) as unknown as Db;
    try {
      const svc = createManageService(db, {
        webBaseUrl: 'https://setcode.watch/',
        newToken: () => 'tok_x',
      });
      const { url } = await svc.issue(7n);
      expect(url).toBe('https://setcode.watch/manage/tok_x');
    } finally {
      await pg.close();
    }
  });
});
