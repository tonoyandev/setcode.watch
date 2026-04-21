import { describe, expect, it, vi } from 'vitest';
import { createHttpApp } from '../http/server.js';
import type { ConfirmationsService } from '../services/confirmations.js';

function makeApp(overrides: Partial<ConfirmationsService> = {}) {
  const service = {
    createPending: vi.fn(),
    confirm: vi.fn(),
    list: vi.fn(),
    remove: vi.fn(),
    sweepExpired: vi.fn(),
    ...overrides,
  } as unknown as ConfirmationsService;

  const app = createHttpApp({
    service,
    botUsername: 'SetCodeBot',
    corsOrigins: ['http://localhost:3000'],
  });
  return { app, service };
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
    };
    expect(body.code).toBe('c_abcdefghijklmnop');
    expect(body.deepLink).toBe('https://t.me/SetCodeBot?start=c_abcdefghijklmnop');
    expect(body.expiresAt).toBe('2026-04-21T10:05:00.000Z');
    expect(createPending).toHaveBeenCalledWith({
      eoa: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    });
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
});
