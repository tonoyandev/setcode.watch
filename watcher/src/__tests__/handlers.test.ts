import type { Address } from 'viem';
import { describe, expect, it, vi } from 'vitest';
import { handleHelp, handleList, handleRemove, handleStart } from '../bot/handlers.js';
import type { ConfirmationsService } from '../services/confirmations.js';

function makeService(overrides: Partial<ConfirmationsService>): ConfirmationsService {
  return {
    createPending: vi.fn(),
    confirm: vi.fn(),
    list: vi.fn(),
    remove: vi.fn(),
    sweepExpired: vi.fn(),
    ...overrides,
  } as unknown as ConfirmationsService;
}

const ADDR = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address;

describe('handleStart', () => {
  it('returns welcome text when no payload is given', async () => {
    const service = makeService({});
    const { reply } = await handleStart(service, {
      payload: undefined,
      chatId: 1n,
      username: null,
    });
    expect(reply).toMatch(/Welcome to SetCode.watch/);
  });

  it('rejects a payload without the c_ prefix', async () => {
    const service = makeService({});
    const { reply } = await handleStart(service, {
      payload: 'random',
      chatId: 1n,
      username: null,
    });
    expect(reply).toMatch(/don't recognise that start parameter/);
  });

  it('forwards a valid c_ code to the service and formats each result', async () => {
    const results = [
      { kind: 'ok', eoa: ADDR } as const,
      { kind: 'already_subscribed', eoa: ADDR } as const,
      { kind: 'cap_reached', max: 10 } as const,
      { kind: 'expired' } as const,
      { kind: 'not_found' } as const,
    ];
    const expected = [
      /Subscribed/,
      /already receiving alerts/,
      /maximum of 10/,
      /expired/,
      /not valid/,
    ];
    const code = `c_${'a'.repeat(16)}`;

    for (let i = 0; i < results.length; i++) {
      const service = makeService({ confirm: vi.fn().mockResolvedValue(results[i]) });
      const { reply } = await handleStart(service, {
        payload: code,
        chatId: 1n,
        username: 'alice',
      });
      const pattern = expected[i];
      if (!pattern) throw new Error('missing expected pattern');
      expect(reply).toMatch(pattern);
      expect(service.confirm).toHaveBeenCalledWith({
        code,
        chatId: 1n,
        username: 'alice',
      });
    }
  });
});

describe('handleHelp', () => {
  it('returns the help catalog', async () => {
    const { reply } = await handleHelp();
    expect(reply).toMatch(/available commands/);
    expect(reply).toMatch(/\/list/);
    expect(reply).toMatch(/\/remove/);
  });
});

describe('handleList', () => {
  it('renders the empty message when there are no subscriptions', async () => {
    const service = makeService({ list: vi.fn().mockResolvedValue([]) });
    const { reply } = await handleList(service, { chatId: 1n, args: '' });
    expect(reply).toMatch(/no confirmed subscriptions/);
  });

  it('renders a bulleted list when subscriptions exist', async () => {
    const service = makeService({
      list: vi
        .fn()
        .mockResolvedValue([{ eoa: ADDR, confirmedAt: new Date('2026-04-21T10:00:00Z') }]),
    });
    const { reply } = await handleList(service, { chatId: 1n, args: '' });
    expect(reply).toMatch(/watching 1 address/);
    expect(reply).toMatch(`• ${ADDR}`);
  });
});

describe('handleRemove', () => {
  it('rejects missing arg with usage text', async () => {
    const service = makeService({});
    const { reply } = await handleRemove(service, { chatId: 1n, args: '' });
    expect(reply).toMatch(/Usage: \/remove/);
  });

  it('rejects a bad EOA', async () => {
    const service = makeService({});
    const { reply } = await handleRemove(service, { chatId: 1n, args: 'not-an-address' });
    expect(reply).toMatch(/valid Ethereum address/);
  });

  it('returns success when the service removed the sub', async () => {
    const remove = vi.fn().mockResolvedValue(true);
    const service = makeService({ remove });
    const { reply } = await handleRemove(service, { chatId: 1n, args: ADDR });
    expect(reply).toMatch(/Unsubscribed/);
    expect(remove).toHaveBeenCalledWith({ eoa: ADDR, chatId: 1n });
  });

  it('lower-cases a mixed-case EOA before calling the service', async () => {
    const remove = vi.fn().mockResolvedValue(false);
    const service = makeService({ remove });
    const mixed = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const { reply } = await handleRemove(service, { chatId: 1n, args: mixed });
    expect(reply).toMatch(/were not subscribed/);
    expect(remove).toHaveBeenCalledWith({ eoa: ADDR, chatId: 1n });
  });
});
