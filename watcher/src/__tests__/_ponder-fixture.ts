import type { PGlite } from '@electric-sql/pglite';

// Ponder owns the real DDL for these tables; in tests we boot pglite with a
// minimal reproduction so the watcher-side read schema has something to talk
// to. Columns and types must match ../db/ponder-read.ts. Column names are
// camelCase to match Ponder's onchainTable emission (see TODO(verify) note
// in ponder-read.ts).
export const PONDER_FIXTURE_SQL = `
  CREATE TYPE classification AS ENUM ('Unknown', 'Verified', 'Malicious');

  CREATE TABLE delegation_event (
    id text PRIMARY KEY,
    eoa bytea NOT NULL,
    "previousTarget" bytea,
    "newTarget" bytea,
    "chainId" integer NOT NULL,
    "blockNumber" bigint NOT NULL,
    timestamp bigint NOT NULL,
    "txHash" bytea NOT NULL
  );

  CREATE TABLE registry_classification_state (
    target bytea PRIMARY KEY,
    current classification NOT NULL,
    reason text NOT NULL,
    "updatedAt" bigint NOT NULL
  );

  CREATE TABLE on_chain_subscription_state (
    eoa bytea PRIMARY KEY,
    active boolean NOT NULL,
    "channelHash" bytea,
    "updatedAt" bigint NOT NULL
  );
`;

export async function installPonderFixture(pg: PGlite): Promise<void> {
  await pg.exec(PONDER_FIXTURE_SQL);
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

// Inserts a delegation_event row directly (bypassing drizzle typing) because
// tests write in the raw bytea shape Ponder would produce.
export async function insertDelegationEvent(
  pg: PGlite,
  input: {
    id: string;
    eoa: string;
    previousTarget: string | null;
    newTarget: string | null;
    chainId: number;
    blockNumber: bigint;
    timestamp: bigint;
    txHash: string;
  },
): Promise<void> {
  await pg.query(
    `INSERT INTO delegation_event
      (id, eoa, "previousTarget", "newTarget", "chainId", "blockNumber", "timestamp", "txHash")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      input.id,
      hexToBytes(input.eoa),
      input.previousTarget === null ? null : hexToBytes(input.previousTarget),
      input.newTarget === null ? null : hexToBytes(input.newTarget),
      input.chainId,
      input.blockNumber.toString(),
      input.timestamp.toString(),
      hexToBytes(input.txHash),
    ],
  );
}

export async function upsertRegistryClassification(
  pg: PGlite,
  input: {
    target: string;
    current: 'Unknown' | 'Verified' | 'Malicious';
    reason: string;
    updatedAt: bigint;
  },
): Promise<void> {
  await pg.query(
    `INSERT INTO registry_classification_state (target, current, reason, "updatedAt")
     VALUES ($1, $2::classification, $3, $4)
     ON CONFLICT (target) DO UPDATE SET current = EXCLUDED.current, reason = EXCLUDED.reason, "updatedAt" = EXCLUDED."updatedAt"`,
    [hexToBytes(input.target), input.current, input.reason, input.updatedAt.toString()],
  );
}
