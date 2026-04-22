import type { Classification } from '@setcode/shared/types';
import { asc, desc, eq } from 'drizzle-orm';
import type { Address } from 'viem';
import type { Db } from '../db/client.js';
import { registryClassificationState } from '../db/ponder-read.js';

export interface RegistryServiceOptions {
  defaultLimit?: number;
  maxLimit?: number;
}

export interface ListRegistryInput {
  classification?: Classification;
  cursor?: number;
  limit?: number;
}

export interface RegistryEntry {
  target: Address;
  classification: Classification;
  reason: string;
  lastClassifiedAt: number;
}

export interface ListRegistryResult {
  entries: RegistryEntry[];
  nextCursor: number | null;
}

// Read-only registry browser data source for the web app.
// Sort order is newest-first by classification update timestamp, with
// target as a stable tie-breaker to keep pagination deterministic.
export function createRegistryService(db: Db, options: RegistryServiceOptions = {}) {
  const defaultLimit = options.defaultLimit ?? 25;
  const maxLimit = options.maxLimit ?? 100;

  async function list(input: ListRegistryInput = {}): Promise<ListRegistryResult> {
    const cursor = input.cursor ?? 0;
    const limit = Math.min(Math.max(input.limit ?? defaultLimit, 1), maxLimit);

    const classificationToEnum = (
      classification: Classification,
    ): 'Unknown' | 'Verified' | 'Malicious' =>
      classification === 'unknown'
        ? 'Unknown'
        : classification === 'verified'
          ? 'Verified'
          : 'Malicious';

    const baseQuery = db
      .select({
        target: registryClassificationState.target,
        current: registryClassificationState.current,
        reason: registryClassificationState.reason,
        updatedAt: registryClassificationState.updatedAt,
      })
      .from(registryClassificationState)
      .orderBy(
        desc(registryClassificationState.updatedAt),
        asc(registryClassificationState.target),
      );

    const rows = input.classification
      ? await baseQuery
          .where(
            eq(
              registryClassificationState.current,
              classificationToEnum(input.classification) as unknown as string,
            ),
          )
          .offset(cursor)
          .limit(limit + 1)
      : await baseQuery.offset(cursor).limit(limit + 1);

    const page = rows.slice(0, limit).map((row) => ({
      target: row.target.toLowerCase() as Address,
      classification: row.current as Classification,
      reason: row.reason,
      lastClassifiedAt: Number(row.updatedAt),
    }));

    return {
      entries: page,
      nextCursor: rows.length > limit ? cursor + limit : null,
    };
  }

  return { list };
}

export type RegistryService = ReturnType<typeof createRegistryService>;
