import { classify as classifyStatic } from '@setcode/shared/registry';
import type { Classification } from '@setcode/shared/types';
import { and, eq } from 'drizzle-orm';
import type { Address } from 'viem';
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
  // Epoch seconds; null when no delegation row exists for this EOA.
  lastUpdated: number | null;
}

export interface CheckServiceOptions {
  chainId: number;
  classification: ClassificationService;
}

export interface CheckService {
  check(eoa: Address): Promise<CheckResult>;
}

// Read-only: looks up the indexer's delegation_state for the EOA, resolves
// the target through the classification service, and annotates the caller
// with where the answer came from. No writes, no persistence. Safe to call
// as often as the rate-limiter allows.
export function createCheckService(db: Db, options: CheckServiceOptions): CheckService {
  async function check(eoa: Address): Promise<CheckResult> {
    const lower = eoa.toLowerCase() as Address;

    const [row] = await db
      .select({
        currentTarget: delegationState.currentTarget,
        lastUpdated: delegationState.lastUpdated,
      })
      .from(delegationState)
      .where(and(eq(delegationState.eoa, lower), eq(delegationState.chainId, options.chainId)))
      .limit(1);

    if (!row || row.currentTarget === null) {
      return {
        eoa: lower,
        chainId: options.chainId,
        currentTarget: null,
        classification: 'unknown',
        source: 'unknown',
        lastUpdated: row ? Number(row.lastUpdated) : null,
      };
    }

    const target = row.currentTarget.toLowerCase() as Address;
    const classification = await options.classification.resolve(target);
    // Replay the resolution path just to tag the source. The classification
    // service deliberately hides this from its main contract so callers
    // don't build logic on provenance; here we expose it for display only.
    const staticHit = classifyStatic(target);
    const source: CheckResult['source'] =
      classification === 'unknown' && staticHit === 'unknown'
        ? 'unknown'
        : classification === staticHit
          ? 'static'
          : 'registry';

    return {
      eoa: lower,
      chainId: options.chainId,
      currentTarget: target,
      classification,
      source,
      lastUpdated: Number(row.lastUpdated),
    };
  }

  return { check };
}
