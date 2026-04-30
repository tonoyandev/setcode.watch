import { describe, expect, it, vi } from 'vitest';
import { createHttpApp } from '../http/server.js';
import type { CheckService } from '../services/check.js';
import type { ConfirmationsService } from '../services/confirmations.js';
import type { ManageService } from '../services/manage.js';
import type { RegistryService } from '../services/registry.js';

function makeApp(
  overrides: Partial<ConfirmationsService> = {},
  checkOverrides: Partial<CheckService> = {},
  manageOverrides: Partial<ManageService> = {},
  registryOverrides: Partial<RegistryService> = {},
  liveCheckableChainIds: readonly number[] = [1, 10, 8453, 42161],
) {
  const service = {
    createPending: vi.fn(),
    confirm: vi.fn(),
    list: vi.fn(),
    remove: vi.fn(),
    sweepExpired: vi.fn(),
    ...overrides,
  } as unknown as ConfirmationsService;

  const checkService = {
    check: vi.fn(),
    ...checkOverrides,
  } as unknown as CheckService;

  const manageService = {
    issue: vi.fn(),
    resolve: vi.fn(),
    listSubscriptions: vi.fn(),
    removeSubscription: vi.fn(),
    revoke: vi.fn(),
    ...manageOverrides,
  } as unknown as ManageService;

  const registryService = {
    list: vi.fn(),
    ...registryOverrides,
  } as unknown as RegistryService;

  const app = createHttpApp({
    service,
    checkService,
    manageService,
    registryService,
    botUsername: 'SetCodeBot',
    corsOrigins: ['http://localhost:3000'],
    liveCheckableChainIds,
  });
  return { app, service, checkService, manageService, registryService };
}

describe('HTTP API', () => {
  it('GET /health returns ok', async () => {
    const { app } = makeApp();
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('POST /confirmations creates a pending row and returns a Telegram deep-link', async () => {
    const createPending = vi.fn().mockResolvedValue({
      code: 'c_abcdefghijklmnop',
      expiresAt: new Date('2026-04-21T10:05:00Z'),
    });
    const { app } = makeApp({ createPending });

    const res = await app.request('/confirmations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eoa: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      code: string;
      deepLink: string;
      expiresAt: string;
      chainIds: number[];
    };
    expect(body.code).toBe('c_abcdefghijklmnop');
    expect(body.deepLink).toBe('https://t.me/SetCodeBot?start=c_abcdefghijklmnop');
    expect(body.expiresAt).toBe('2026-04-21T10:05:00.000Z');
    // Bell-flow default: missing chainIds → all four supported chains.
    expect(body.chainIds).toEqual([1, 10, 8453, 42161]);
    expect(createPending).toHaveBeenCalledWith({
      eoa: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      chainIds: [1, 10, 8453, 42161],
    });
  });

  it('POST /confirmations forwards an explicit chainIds list from the body', async () => {
    const createPending = vi.fn().mockResolvedValue({
      code: 'c_abcdefghijklmnop',
      expiresAt: new Date('2026-04-21T10:05:00Z'),
    });
    const { app } = makeApp({ createPending });
    const res = await app.request('/confirmations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eoa: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        chainIds: [8453, 10],
      }),
    });
    expect(res.status).toBe(200);
    expect(createPending).toHaveBeenCalledWith({
      eoa: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      chainIds: [8453, 10],
    });
  });

  it('POST /confirmations rejects when the chainIds list contains an unsupported chain', async () => {
    const createPending = vi.fn();
    const { app } = makeApp({ createPending });
    const res = await app.request('/confirmations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eoa: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        chainIds: [1, 99999],
      }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'unsupported_chain' });
    expect(createPending).not.toHaveBeenCalled();
  });

  it('POST /confirmations rejects invalid JSON', async () => {
    const { app } = makeApp();
    const res = await app.request('/confirmations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not-json',
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_json' });
  });

  it('POST /confirmations rejects missing eoa', async () => {
    const { app } = makeApp();
    const res = await app.request('/confirmations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_body' });
  });

  it('POST /confirmations rejects a bad EOA', async () => {
    const createPending = vi.fn();
    const { app } = makeApp({ createPending });
    const res = await app.request('/confirmations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eoa: 'nope' }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_eoa' });
    expect(createPending).not.toHaveBeenCalled();
  });

  it('POST /check returns a classification result for a valid EOA', async () => {
    const check = vi.fn().mockResolvedValue({
      eoa: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      chainId: 1,
      currentTarget: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      classification: 'malicious',
      source: 'registry',
      lastUpdated: 1700000000,
    });
    const { app } = makeApp({}, { check });
    const res = await app.request('/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eoa: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      eoa: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      chainId: 1,
      currentTarget: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      classification: 'malicious',
      source: 'registry',
      lastUpdated: 1700000000,
    });
    expect(check).toHaveBeenCalledWith('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 1);
  });

  it('POST /check forwards an explicit chainId to the service', async () => {
    const check = vi.fn().mockResolvedValue({
      eoa: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      chainId: 8453,
      currentTarget: null,
      classification: 'unknown',
      source: 'unknown',
      lastUpdated: null,
    });
    const { app } = makeApp({}, { check });
    const res = await app.request('/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eoa: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', chainId: 8453 }),
    });
    expect(res.status).toBe(200);
    expect(check).toHaveBeenCalledWith('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 8453);
  });

  it('POST /check accepts a live-only chainId (testnets, non-indexed L2s)', async () => {
    // Sepolia (11155111) isn't in SUPPORTED_CHAIN_IDS but the watcher
    // has a public RPC for it. /check should still accept it so the
    // website can render a live delegation status for testnet rows.
    const check = vi.fn().mockResolvedValue({
      eoa: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      chainId: 11155111,
      currentTarget: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      classification: 'unknown',
      source: 'unknown',
      lastUpdated: null,
    });
    const { app } = makeApp({}, { check }, {}, {}, [1, 10, 8453, 42161, 11155111]);
    const res = await app.request('/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eoa: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        chainId: 11155111,
      }),
    });
    expect(res.status).toBe(200);
    expect(check).toHaveBeenCalledWith('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 11155111);
  });

  it('POST /check rejects chainIds the watcher cannot reach', async () => {
    // chain 9999 is in neither SUPPORTED_CHAIN_IDS nor the live-RPC
    // map → 400 unsupported_chain. Without this guard the service
    // would reach for an undefined RPC URL and hang.
    const check = vi.fn();
    const { app } = makeApp({}, { check });
    const res = await app.request('/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eoa: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', chainId: 9999 }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'unsupported_chain' });
    expect(check).not.toHaveBeenCalled();
  });

  it('POST /confirmations still rejects live-only chainIds', async () => {
    // /confirmations is the subscription surface — live-only chains
    // can't be subscribed to (no indexer = no alerts), so the
    // boundary keeps rejecting them even when /check would accept.
    const createPending = vi.fn();
    const { app } = makeApp({ createPending }, {}, {}, {}, [1, 10, 8453, 42161, 11155111]);
    const res = await app.request('/confirmations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eoa: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        chainIds: [11155111],
      }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'unsupported_chain' });
    expect(createPending).not.toHaveBeenCalled();
  });

  it('GET /manage/:token returns the chat subscriptions on happy path', async () => {
    const listSubscriptions = vi.fn().mockResolvedValue({
      kind: 'ok',
      chatId: 42n,
      subscriptions: [
        {
          eoa: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          chainId: 1,
          confirmedAt: new Date('2026-04-21T10:00:00Z'),
        },
      ],
    });
    const { app } = makeApp({}, {}, { listSubscriptions });
    const res = await app.request('/manage/abcdefgh12345678');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      subscriptions: [
        {
          eoa: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          chainId: 1,
          confirmedAt: '2026-04-21T10:00:00.000Z',
        },
      ],
    });
    expect(listSubscriptions).toHaveBeenCalledWith('abcdefgh12345678');
  });

  it('GET /manage/:token rejects malformed tokens and surfaces not_found', async () => {
    const listSubscriptions = vi.fn().mockResolvedValue({ kind: 'not_found' });
    const { app } = makeApp({}, {}, { listSubscriptions });

    const bad = await app.request('/manage/short');
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: 'invalid_token' });
    expect(listSubscriptions).not.toHaveBeenCalled();

    const missing = await app.request('/manage/abcdefgh12345678');
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'not_found' });
  });

  it('POST /manage/:token/remove deletes an EOA for the chat', async () => {
    const removeSubscription = vi.fn().mockResolvedValue({ kind: 'ok', removed: true });
    const { app } = makeApp({}, {}, { removeSubscription });
    const res = await app.request('/manage/abcdefgh12345678/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eoa: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ removed: true });
    expect(removeSubscription).toHaveBeenCalledWith(
      'abcdefgh12345678',
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      1,
    );
  });

  it('POST /manage/:token/remove rejects bad input and surfaces not_found', async () => {
    const removeSubscription = vi.fn().mockResolvedValue({ kind: 'not_found' });
    const { app } = makeApp({}, {}, { removeSubscription });

    const badToken = await app.request('/manage/short/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eoa: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }),
    });
    expect(badToken.status).toBe(400);
    expect(await badToken.json()).toEqual({ error: 'invalid_token' });

    const badJson = await app.request('/manage/abcdefgh12345678/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad',
    });
    expect(badJson.status).toBe(400);
    expect(await badJson.json()).toEqual({ error: 'invalid_json' });

    const missing = await app.request('/manage/abcdefgh12345678/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({ error: 'invalid_body' });

    const badEoa = await app.request('/manage/abcdefgh12345678/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eoa: 'nope' }),
    });
    expect(badEoa.status).toBe(400);
    expect(await badEoa.json()).toEqual({ error: 'invalid_eoa' });

    const notFound = await app.request('/manage/abcdefgh12345678/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eoa: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }),
    });
    expect(notFound.status).toBe(404);
    expect(await notFound.json()).toEqual({ error: 'not_found' });
  });

  it('POST /check rejects invalid JSON, invalid body, and bad EOA shape', async () => {
    const check = vi.fn();
    const { app } = makeApp({}, { check });

    const badJson = await app.request('/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad',
    });
    expect(badJson.status).toBe(400);
    expect(await badJson.json()).toEqual({ error: 'invalid_json' });

    const missing = await app.request('/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({ error: 'invalid_body' });

    const badEoa = await app.request('/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eoa: 'nope' }),
    });
    expect(badEoa.status).toBe(400);
    expect(await badEoa.json()).toEqual({ error: 'invalid_eoa' });
    expect(check).not.toHaveBeenCalled();
  });

  it('GET /registry returns paginated entries and optional cursor', async () => {
    const list = vi.fn().mockResolvedValue({
      entries: [
        {
          target: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          classification: 'verified',
          reason: 'reviewed',
          lastClassifiedAt: 1700000000,
        },
      ],
      nextCursor: 25,
    });
    const { app } = makeApp({}, {}, {}, { list });

    const res = await app.request('/registry?classification=verified&limit=25');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      entries: [
        {
          target: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          classification: 'verified',
          reason: 'reviewed',
          lastClassifiedAt: 1700000000,
        },
      ],
      nextCursor: 25,
    });
    expect(list).toHaveBeenCalledWith({ classification: 'verified', limit: 25 });
  });

  it('GET /registry rejects malformed query params', async () => {
    const { app, registryService } = makeApp();
    const res = await app.request('/registry?classification=nope&cursor=-1');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_query' });
    expect(registryService.list).not.toHaveBeenCalled();
  });
});
