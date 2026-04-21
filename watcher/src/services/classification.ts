import { classify as classifyStatic } from '@setcode/shared/registry';
import type { Classification } from '@setcode/shared/types';
import { inArray } from 'drizzle-orm';
import type { Address } from 'viem';
import type { Db } from '../db/client.js';
import { registryClassificationState } from '../db/ponder-read.js';

export type PonderReadDb = Db;

export interface ClassificationService {
  resolve(target: Address | null): Promise<Classification>;
  resolveMany(targets: readonly (Address | null)[]): Promise<Map<string, Classification>>;
}

// Classification resolution order:
//   1. Ponder's registry_classification_state (on-chain SetCodeRegistry events)
//   2. @setcode/shared static JSON registry (the committed ground truth)
//   3. 'unknown'
//
// The on-chain registry wins because it can downgrade an entry (e.g. flag a
// previously-verified target as malicious) without a package release. The
// static registry is the cold fallback for targets the registry contract has
// not yet seen. `null` (no delegation) always resolves to 'unknown'.
export function createClassificationService(db: PonderReadDb): ClassificationService {
  async function resolveMany(
    targets: readonly (Address | null)[],
  ): Promise<Map<string, Classification>> {
    const out = new Map<string, Classification>();
    const nonNull = targets.filter((t): t is Address => t !== null);
    if (nonNull.length === 0) return out;

    const unique = Array.from(new Set(nonNull.map((t) => t.toLowerCase() as Address)));
    const rows = await db
      .select({
        target: registryClassificationState.target,
        current: registryClassificationState.current,
      })
      .from(registryClassificationState)
      .where(inArray(registryClassificationState.target, unique));

    const onChain = new Map<string, Classification>();
    for (const row of rows) {
      onChain.set(row.target.toLowerCase(), row.current as Classification);
    }

    for (const target of unique) {
      const key = target.toLowerCase();
      const onChainHit = onChain.get(key);
      if (onChainHit) {
        out.set(key, onChainHit);
      } else {
        out.set(key, classifyStatic(target));
      }
    }
    return out;
  }

  async function resolve(target: Address | null): Promise<Classification> {
    if (target === null) return 'unknown';
    const map = await resolveMany([target]);
    return map.get(target.toLowerCase()) ?? 'unknown';
  }

  return { resolve, resolveMany };
}
