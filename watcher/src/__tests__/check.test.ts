import { readFileSync, readdirSync } from 'node:fs';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
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

// Tiny in-process JSON-RPC server. We spin up one of these per test
// that exercises the live-state fallback so we can assert on the
// exact requests viem makes (and the responses it parses) without
// reaching for vi.mock module-level acrobatics.
interface FakeRpc {
  url: string;
  hits: { method: string; params: unknown }[];
  close: () => Promise<void>;
}
function startFakeRpc(handler: (method: string, params: unknown) => unknown): Promise<FakeRpc> {
  return new Promise((resolve) => {
    const hits: FakeRpc['hits'] = [];
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        const parsed = JSON.parse(body) as { id: number; method: string; params: unknown };
        hits.push({ method: parsed.method, params: parsed.params });
        try {
          const result = handler(parsed.method, parsed.params);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ jsonrpc: '2.0', id: parsed.id, result }));
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ jsonrpc: '2.0', id: parsed.id, error: String(err) }));
        }
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        url: `http://127.0.0.1:${port}`,
        hits,
        close: () =>
          new Promise<void>((r) => {
            server.close(() => r());
          }),
      });
    });
  });
}

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
      classification: createClassificationService(db),
    });
  }

  it('returns unknown/source=unknown when no delegation row exists', async () => {
    const result = await service().check(EOA, CHAIN_ID_MAINNET);
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
    const result = await service().check(EOA, CHAIN_ID_MAINNET);
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
    const result = await service().check(EOA, CHAIN_ID_MAINNET);
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
    const result = await service().check(EOA, CHAIN_ID_MAINNET);
    expect(result.classification).toBe('unknown');
    expect(result.source).toBe('unknown');
  });

  // --------------------------------------------------------------------
  // Live-state fallback. When the indexer has never seen the EOA we
  // query the chain's RPC directly and parse 0xef0100||target.
  // --------------------------------------------------------------------

  it('falls back to live RPC when no delegation_state row exists', async () => {
    const liveTarget = '0x4cd241e8d1510e30b2076397afc7508ae59c66c9' as Address;
    const rpc = await startFakeRpc((method) => {
      if (method !== 'eth_getCode') throw new Error(`unexpected method: ${method}`);
      return `0xef0100${liveTarget.slice(2)}`;
    });
    try {
      const svc = createCheckService(db, {
        classification: createClassificationService(db),
        rpcUrls: new Map([[CHAIN_ID_MAINNET, rpc.url]]),
      });
      const result = await svc.check(EOA, CHAIN_ID_MAINNET);
      expect(result.currentTarget).toBe(liveTarget);
      // No registry entry → unknown classification, but we still
      // report it as a real delegation, not "Not Detected".
      expect(result.classification).toBe('unknown');
      // lastUpdated=null is the contract for live-detected results
      // (we have no block timestamp because we didn't index the event).
      expect(result.lastUpdated).toBeNull();
      expect(rpc.hits.some((h) => h.method === 'eth_getCode')).toBe(true);
    } finally {
      await rpc.close();
    }
  });

  it('classifies live-detected delegations through the registry', async () => {
    const liveTarget = TARGET_MALICIOUS;
    await upsertRegistryClassification(pg, {
      target: liveTarget,
      current: 'Malicious',
      reason: 'known drainer',
      updatedAt: 1n,
    });
    const rpc = await startFakeRpc(() => `0xef0100${liveTarget.slice(2)}`);
    try {
      const svc = createCheckService(db, {
        classification: createClassificationService(db),
        rpcUrls: new Map([[CHAIN_ID_MAINNET, rpc.url]]),
      });
      const result = await svc.check(EOA, CHAIN_ID_MAINNET);
      expect(result.currentTarget).toBe(liveTarget.toLowerCase());
      expect(result.classification).toBe('malicious');
      expect(result.source).toBe('registry');
      expect(result.lastUpdated).toBeNull();
    } finally {
      await rpc.close();
    }
  });

  it('returns Not Detected when the EOA has no code on chain', async () => {
    const rpc = await startFakeRpc(() => '0x');
    try {
      const svc = createCheckService(db, {
        classification: createClassificationService(db),
        rpcUrls: new Map([[CHAIN_ID_MAINNET, rpc.url]]),
      });
      const result = await svc.check(EOA, CHAIN_ID_MAINNET);
      expect(result.currentTarget).toBeNull();
      expect(result.lastUpdated).toBeNull();
    } finally {
      await rpc.close();
    }
  });

  it('returns Not Detected when on-chain code is a regular contract (no 0xef0100 prefix)', async () => {
    const rpc = await startFakeRpc(() => '0x6080604052348015600f57600080fd5b50');
    try {
      const svc = createCheckService(db, {
        classification: createClassificationService(db),
        rpcUrls: new Map([[CHAIN_ID_MAINNET, rpc.url]]),
      });
      const result = await svc.check(EOA, CHAIN_ID_MAINNET);
      expect(result.currentTarget).toBeNull();
    } finally {
      await rpc.close();
    }
  });

  it('skips the live fallback when no RPC URL is configured for the chain', async () => {
    // Only chain 1 has an RPC; ask about chain 8453 → no fallback,
    // result is the legacy "Not Detected".
    const rpc = await startFakeRpc(() => '0xdeadbeef');
    try {
      const svc = createCheckService(db, {
        classification: createClassificationService(db),
        rpcUrls: new Map([[CHAIN_ID_MAINNET, rpc.url]]),
      });
      const result = await svc.check(EOA, 8453);
      expect(result.currentTarget).toBeNull();
      expect(rpc.hits).toHaveLength(0);
    } finally {
      await rpc.close();
    }
  });

  it('does not call the live RPC when the indexer already has a row', async () => {
    await upsertDelegationState(pg, {
      eoa: EOA,
      chainId: CHAIN_ID_MAINNET,
      currentTarget: '0x9999999999999999999999999999999999999999',
      lastUpdated: 50n,
    });
    const rpc = await startFakeRpc(() => {
      throw new Error('RPC must not be called when the indexer has a row');
    });
    try {
      const svc = createCheckService(db, {
        classification: createClassificationService(db),
        rpcUrls: new Map([[CHAIN_ID_MAINNET, rpc.url]]),
      });
      const result = await svc.check(EOA, CHAIN_ID_MAINNET);
      expect(result.currentTarget).toBe('0x9999999999999999999999999999999999999999');
      expect(result.lastUpdated).toBe(50);
      expect(rpc.hits).toHaveLength(0);
    } finally {
      await rpc.close();
    }
  });

  it('swallows RPC errors and falls through to Not Detected', async () => {
    const rpc = await startFakeRpc(() => {
      throw new Error('RPC down');
    });
    try {
      const svc = createCheckService(db, {
        classification: createClassificationService(db),
        rpcUrls: new Map([[CHAIN_ID_MAINNET, rpc.url]]),
      });
      const result = await svc.check(EOA, CHAIN_ID_MAINNET);
      expect(result.currentTarget).toBeNull();
      expect(result.classification).toBe('unknown');
    } finally {
      await rpc.close();
    }
  });
});
