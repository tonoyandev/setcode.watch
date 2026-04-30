import { classify as classifyStatic } from '@setcode/shared/registry';
import type { Classification } from '@setcode/shared/types';
import { and, eq } from 'drizzle-orm';
import { http, type Address, type PublicClient, createPublicClient, isAddress } from 'viem';
import type { Db } from '../db/client.js';
import { delegationState } from '../db/ponder-read.js';
import type { ClassificationService } from './classification.js';

export interface CheckResult {
  eoa: Address;
  chainId: number;
  currentTarget: Address | null;
  classification: Classification;
  // Where the classification came from. Lets the UI show provenance: a
  // `registry` hit means the on-chain SetCodeRegistry has an explicit record;
  // `static` means the committed @setcode/shared registry; `unknown` means
  // no record anywhere (either no delegation, or a delegation to a target
  // we've never seen).
  source: 'registry' | 'static' | 'unknown';
  // Epoch seconds; null when no delegation row exists for this EOA, OR
  // when the result came from the live RPC fallback (where we don't
  // have block timestamps).
  lastUpdated: number | null;
}

export interface CheckServiceOptions {
  classification: ClassificationService;
  // Per-chain RPC URL map for the live-state fallback. When the indexer
  // hasn't seen an EOA (no row in delegation_state — typical for any
  // EOA delegated before our ETH_START_BLOCK), we query the chain
  // directly via eth_getCode and parse the 7702 prefix to detect a
  // current delegation. Optional: when absent, an unknown EOA returns
  // "Not Detected" without trying the RPC (legacy behaviour).
  rpcUrls?: ReadonlyMap<number, string>;
}

export interface CheckService {
  // chainId is per-call now (was per-service): one CheckService instance
  // serves all monitored chains. Callers (HTTP /check, bot watch flow)
  // are responsible for validating that chainId is in SUPPORTED_CHAIN_IDS
  // before reaching this layer.
  check(eoa: Address, chainId: number): Promise<CheckResult>;
}

// EIP-7702 delegated EOAs return code with a fixed prefix:
//   0xef01 0x00 || 20-byte authorized address
// So: "0x" + "ef0100" + 40-hex address = 48 characters total. Anything
// shorter, missing the prefix, or longer (regular contract code that
// happens to start the same) is not a delegation.
const SETCODE_PREFIX = '0xef0100';
const SETCODE_LEN = 48;

function parseDelegate(code: string | undefined | null): Address | null {
  if (!code) return null;
  const lower = code.toLowerCase();
  if (!lower.startsWith(SETCODE_PREFIX)) return null;
  if (lower.length !== SETCODE_LEN) return null;
  const target = `0x${lower.slice(SETCODE_PREFIX.length)}`;
  return isAddress(target) ? (target as Address) : null;
}

// Read-only: looks up the indexer's delegation_state for the (EOA, chainId)
// pair. If the indexer has never seen this EOA we fall back to a live
// eth_getCode against the chain's RPC, which catches delegations that
// pre-date our ETH_START_BLOCK. Either path resolves the target through
// the classification service. No writes, no persistence.
export function createCheckService(db: Db, options: CheckServiceOptions): CheckService {
  // Cache one viem PublicClient per chain so we don't reconstruct the
  // transport for every /check. The map is small (≤ SUPPORTED_CHAINS)
  // and clients have no per-call state worth flushing.
  const clientCache = new Map<number, PublicClient>();
  function getClient(chainId: number): PublicClient | null {
    const cached = clientCache.get(chainId);
    if (cached) return cached;
    const rpcUrl = options.rpcUrls?.get(chainId);
    if (!rpcUrl) return null;
    const client = createPublicClient({ transport: http(rpcUrl) });
    clientCache.set(chainId, client);
    return client;
  }

  async function liveDelegate(eoa: Address, chainId: number): Promise<Address | null> {
    const client = getClient(chainId);
    if (!client) return null;
    try {
      const code = await client.getCode({ address: eoa });
      return parseDelegate(code);
    } catch (err) {
      // RPC errors aren't a reason to surface "Not Detected" loudly —
      // log so operators see provider issues, then fall through to the
      // null branch like a regular cache miss.
      console.warn(
        `[checkService] live getCode failed for ${eoa} on chain ${chainId}:`,
        (err as Error).message,
      );
      return null;
    }
  }

  function classifyResult(target: Address, classification: Classification): CheckResult['source'] {
    // Replay the resolution path just to tag the source. The classification
    // service deliberately hides this from its main contract so callers
    // don't build logic on provenance; here we expose it for display only.
    const staticHit = classifyStatic(target);
    if (classification === 'unknown' && staticHit === 'unknown') return 'unknown';
    if (classification === staticHit) return 'static';
    return 'registry';
  }

  async function check(eoa: Address, chainId: number): Promise<CheckResult> {
    const lower = eoa.toLowerCase() as Address;

    const [row] = await db
      .select({
        currentTarget: delegationState.currentTarget,
        lastUpdated: delegationState.lastUpdated,
      })
      .from(delegationState)
      .where(and(eq(delegationState.eoa, lower), eq(delegationState.chainId, chainId)))
      .limit(1);

    // Indexed-state hit: the indexer has seen this EOA. Trust it — even
    // when currentTarget is null (the EOA revoked its delegation). The
    // event log is authoritative and a live RPC call would just confirm.
    if (row) {
      if (row.currentTarget === null) {
        return {
          eoa: lower,
          chainId,
          currentTarget: null,
          classification: 'unknown',
          source: 'unknown',
          lastUpdated: Number(row.lastUpdated),
        };
      }
      const target = row.currentTarget.toLowerCase() as Address;
      const classification = await options.classification.resolve(target);
      return {
        eoa: lower,
        chainId,
        currentTarget: target,
        classification,
        source: classifyResult(target, classification),
        lastUpdated: Number(row.lastUpdated),
      };
    }

    // No event-history row. Try the live RPC fallback so EOAs delegated
    // before our ETH_START_BLOCK still light up in the lookup card.
    // Alerts still flow exclusively through the indexed event path —
    // this branch is read-only enrichment for the website.
    const liveTarget = await liveDelegate(lower, chainId);
    if (liveTarget) {
      const classification = await options.classification.resolve(liveTarget);
      return {
        eoa: lower,
        chainId,
        currentTarget: liveTarget,
        classification,
        source: classifyResult(liveTarget, classification),
        lastUpdated: null,
      };
    }

    return {
      eoa: lower,
      chainId,
      currentTarget: null,
      classification: 'unknown',
      source: 'unknown',
      lastUpdated: null,
    };
  }

  return { check };
}
