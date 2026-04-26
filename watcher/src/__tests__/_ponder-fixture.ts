import type { PGlite } from '@electric-sql/pglite';

// Ponder owns the real DDL for these tables; in tests we boot pglite with a
// minimal reproduction so the watcher-side read schema has something to talk
// to. Columns and types must mirror Ponder 0.16's emission, which the
// watcher's read schema (../db/ponder-read.ts) is now matched against:
//   - addresses / hashes are `text` (lowercase 0x-prefixed)
//   - block / timestamp values are `numeric(78,0)` (uint256-wide)
//   - column names are snake_case
export const PONDER_FIXTURE_SQL = `
  CREATE TYPE classification AS ENUM ('Unknown', 'Verified', 'Malicious');

  CREATE TABLE delegation_event (
    id text PRIMARY KEY,
    eoa text NOT NULL,
    previous_target text,
    new_target text,
    chain_id integer NOT NULL,
    block_number numeric(78,0) NOT NULL,
    timestamp numeric(78,0) NOT NULL,
    tx_hash text NOT NULL
  );

  CREATE TABLE registry_classification_state (
    target text PRIMARY KEY,
    current classification NOT NULL,
    reason text NOT NULL,
    updated_at numeric(78,0) NOT NULL
  );

  CREATE TABLE on_chain_subscription_state (
    eoa text PRIMARY KEY,
    active boolean NOT NULL,
    channel_hash text,
    updated_at numeric(78,0) NOT NULL
  );

  CREATE TABLE delegation_state (
    eoa text NOT NULL,
    chain_id integer NOT NULL,
    current_target text,
    last_updated numeric(78,0) NOT NULL,
    PRIMARY KEY (eoa, chain_id)
  );
`;

export async function installPonderFixture(pg: PGlite): Promise<void> {
  await pg.exec(PONDER_FIXTURE_SQL);
}

// Inserts a delegation_event row directly, mirroring how Ponder writes them
// (lowercase 0x-prefixed text). Tests express addresses naturally; we just
// lowercase before insert to match the on-disk shape.
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
      (id, eoa, previous_target, new_target, chain_id, block_number, timestamp, tx_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      input.id,
      input.eoa.toLowerCase(),
      input.previousTarget === null ? null : input.previousTarget.toLowerCase(),
      input.newTarget === null ? null : input.newTarget.toLowerCase(),
      input.chainId,
      input.blockNumber.toString(),
      input.timestamp.toString(),
      input.txHash.toLowerCase(),
    ],
  );
}

export async function upsertDelegationState(
  pg: PGlite,
  input: {
    eoa: string;
    chainId: number;
    currentTarget: string | null;
    lastUpdated: bigint;
  },
): Promise<void> {
  await pg.query(
    `INSERT INTO delegation_state (eoa, chain_id, current_target, last_updated)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (eoa, chain_id) DO UPDATE SET
       current_target = EXCLUDED.current_target,
       last_updated = EXCLUDED.last_updated`,
    [
      input.eoa.toLowerCase(),
      input.chainId,
      input.currentTarget === null ? null : input.currentTarget.toLowerCase(),
      input.lastUpdated.toString(),
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
    `INSERT INTO registry_classification_state (target, current, reason, updated_at)
     VALUES ($1, $2::classification, $3, $4)
     ON CONFLICT (target) DO UPDATE SET current = EXCLUDED.current, reason = EXCLUDED.reason, updated_at = EXCLUDED.updated_at`,
    [input.target.toLowerCase(), input.current, input.reason, input.updatedAt.toString()],
  );
}
