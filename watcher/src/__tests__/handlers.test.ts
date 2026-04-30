import type { Address } from 'viem';
import { describe, expect, it, vi } from 'vitest';
import {
  handleHelp,
  handleList,
  handleManage,
  handleRemove,
  handleStart,
} from '../bot/handlers.js';
import type { CheckService } from '../services/check.js';
import type { ConfirmationsService } from '../services/confirmations.js';
import type { ManageService } from '../services/manage.js';

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

function makeCheck(overrides: Partial<CheckService> = {}): CheckService {
  return {
    check: vi.fn().mockResolvedValue({
      eoa: ADDR,
      chainId: 1,
      currentTarget: null,
      classification: 'unknown',
      source: 'unknown',
      lastUpdated: null,
    }),
    ...overrides,
  } as unknown as CheckService;
}

const ADDR = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address;
const TARGET = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address;

describe('handleStart', () => {
  it('returns welcome text when no payload is given', async () => {
    const service = makeService({});
    const check = makeCheck();
    const { reply } = await handleStart(service, check, {
      payload: undefined,
      chatId: 1n,
      username: null,
    });
    expect(reply).toMatch(/Welcome to SetCode.watch/);
  });

  it('rejects an unknown-prefix payload', async () => {
    const service = makeService({});
    const check = makeCheck();
    const { reply } = await handleStart(service, check, {
      payload: 'random',
      chatId: 1n,
      username: null,
    });
    expect(reply).toMatch(/don't recognise that start parameter/);
  });

  it('rejects a c_ payload with the wrong body shape', async () => {
    const service = makeService({});
    const check = makeCheck();
    const { reply } = await handleStart(service, check, {
      payload: 'c_short',
      chatId: 1n,
      username: null,
    });
    expect(reply).toMatch(/don't recognise that start parameter/);
  });

  it('forwards a valid c_ code to the service and formats each result', async () => {
    const results = [
      // Bell-flow: subscribed to all four chains in one shot.
      {
        kind: 'ok',
        eoa: ADDR,
        addedChainIds: [1, 10, 8453, 42161],
        alreadyChainIds: [],
      } as const,
      // Mixed: was already on Ethereum, asked for all → three new + one kept.
      {
        kind: 'ok',
        eoa: ADDR,
        addedChainIds: [10, 8453, 42161],
        alreadyChainIds: [1],
      } as const,
      // Already had everything requested.
      {
        kind: 'already_subscribed',
        eoa: ADDR,
        chainIds: [1, 10, 8453, 42161],
      } as const,
      { kind: 'cap_reached', max: 10 } as const,
      { kind: 'expired' } as const,
      { kind: 'not_found' } as const,
    ];
    const expected = [
      /Subscribed/,
      /Newly watching/,
      /already receiving alerts/,
      /maximum of 10/,
      /expired/,
      /not valid/,
    ];
    const code = `c_${'a'.repeat(16)}`;

    for (let i = 0; i < results.length; i++) {
      const service = makeService({ confirm: vi.fn().mockResolvedValue(results[i]) });
      const check = makeCheck();
      const { reply } = await handleStart(service, check, {
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

  it('handles a w_ payload by running CheckService and rendering the reply', async () => {
    const service = makeService({});
    const check = makeCheck({
      check: vi.fn().mockResolvedValue({
        eoa: ADDR,
        chainId: 1,
        currentTarget: TARGET,
        classification: 'malicious',
        source: 'registry',
        lastUpdated: 1000,
      }),
    });

    const { reply } = await handleStart(service, check, {
      payload: `w_${ADDR}`,
      chatId: 1n,
      username: null,
    });

    expect(check.check).toHaveBeenCalledWith(ADDR, 1);
    expect(reply).toMatch(new RegExp(ADDR));
    expect(reply).toMatch(new RegExp(TARGET));
    expect(reply).toMatch(/Malicious/);
  });

  it('routes a w_<chainId>_<addr> payload to the right chain', async () => {
    const service = makeService({});
    const check = makeCheck({
      check: vi.fn().mockResolvedValue({
        eoa: ADDR,
        chainId: 8453,
        currentTarget: TARGET,
        classification: 'verified',
        source: 'registry',
        lastUpdated: 1000,
      }),
    });

    const { reply } = await handleStart(service, check, {
      payload: `w_8453_${ADDR}`,
      chatId: 1n,
      username: null,
    });

    expect(check.check).toHaveBeenCalledWith(ADDR, 8453);
    expect(reply).toMatch(/Base/);
  });

  it('rejects a w_ payload that targets an unsupported chain', async () => {
    const service = makeService({});
    const check = makeCheck();
    const { reply } = await handleStart(service, check, {
      payload: `w_99999_${ADDR}`,
      chatId: 1n,
      username: null,
    });
    expect(reply).toMatch(/don't recognise that start parameter/);
    expect(check.check).not.toHaveBeenCalled();
  });

  it('rejects a malformed w_ payload', async () => {
    const service = makeService({});
    const check = makeCheck();
    const { reply } = await handleStart(service, check, {
      payload: 'w_not-an-address',
      chatId: 1n,
      username: null,
    });
    expect(reply).toMatch(/don't recognise that start parameter/);
    expect(check.check).not.toHaveBeenCalled();
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
        .mockResolvedValue([
          { eoa: ADDR, chainId: 1, confirmedAt: new Date('2026-04-21T10:00:00Z') },
        ]),
    });
    const { reply } = await handleList(service, { chatId: 1n, args: '' });
    expect(reply).toMatch(/watching 1 address/);
    expect(reply).toMatch(`• ${ADDR}`);
  });

  it('annotates non-mainnet rows with the chain name', async () => {
    const service = makeService({
      list: vi.fn().mockResolvedValue([
        { eoa: ADDR, chainId: 1, confirmedAt: new Date('2026-04-21T10:00:00Z') },
        { eoa: ADDR, chainId: 8453, confirmedAt: new Date('2026-04-21T10:00:00Z') },
      ]),
    });
    const { reply } = await handleList(service, { chatId: 1n, args: '' });
    expect(reply).toMatch(`• ${ADDR}\n`); // mainnet line, no suffix
    expect(reply).toMatch(`• ${ADDR} (Base)`);
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
    expect(reply).toMatch(/valid EVM address/);
  });

  it('returns success when the service removed the sub', async () => {
    const remove = vi.fn().mockResolvedValue(true);
    const service = makeService({ remove });
    const { reply } = await handleRemove(service, { chatId: 1n, args: ADDR });
    expect(reply).toMatch(/Unsubscribed/);
    expect(remove).toHaveBeenCalledWith({ eoa: ADDR, chainId: 1, chatId: 1n });
  });

  it('lower-cases a mixed-case EOA before calling the service', async () => {
    const remove = vi.fn().mockResolvedValue(false);
    const service = makeService({ remove });
    const mixed = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const { reply } = await handleRemove(service, { chatId: 1n, args: mixed });
    expect(reply).toMatch(/were not subscribed/);
    expect(remove).toHaveBeenCalledWith({ eoa: ADDR, chainId: 1, chatId: 1n });
  });

  it('routes a chain shortName second arg to the right chain', async () => {
    const remove = vi.fn().mockResolvedValue(true);
    const service = makeService({ remove });
    const { reply } = await handleRemove(service, { chatId: 1n, args: `${ADDR} base` });
    expect(reply).toMatch(/Unsubscribed/);
    expect(reply).toMatch(/Base/);
    expect(remove).toHaveBeenCalledWith({ eoa: ADDR, chainId: 8453, chatId: 1n });
  });
});

describe('handleManage', () => {
  it('issues a fresh token and formats the revoke + link reply', async () => {
    const issue = vi.fn().mockResolvedValue({
      token: 'tok_1',
      url: 'https://setcode.watch/manage/tok_1',
    });
    const manage = { issue } as unknown as ManageService;
    const { reply } = await handleManage(manage, { chatId: 99n, args: '' });
    expect(issue).toHaveBeenCalledWith(99n);
    expect(reply).toMatch(/previous \/manage link/);
    expect(reply).toMatch('https://setcode.watch/manage/tok_1');
  });
});
