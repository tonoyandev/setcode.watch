import { boolean, customType, integer, pgSchema, pgTable, text } from 'drizzle-orm/pg-core';
import type { Hex } from 'viem';

// Ponder writes to whatever schema its `DATABASE_SCHEMA` env names. In our
// docker-compose stack that's `indexer`; in unit tests we boot pglite and the
// fixture creates tables in `public`. The watcher's read schema therefore
// needs a configurable namespace — hardcoding either side breaks the other.
//
// We read `WATCHER_PONDER_SCHEMA` at import time (not on every query) because
// drizzle bakes the qualified table name into the SQL it generates. Tests do
// not set the var, so they get `public` and keep working.
const PONDER_SCHEMA = process.env.WATCHER_PONDER_SCHEMA?.trim() || 'public';
const ponderTable: typeof pgTable =
  PONDER_SCHEMA === 'public'
    ? pgTable
    : (pgSchema(PONDER_SCHEMA).table as unknown as typeof pgTable);

// Ponder 0.16 stores `hex()` columns as plain `text` (lowercase 0x-prefixed
// strings), not bytea. We still normalise to lowercase on read so the rest of
// the watcher can do byte-string comparisons against shared/registry values
// without re-casing.
const ponderHex = customType<{ data: Hex; driverData: string }>({
  dataType() {
    return 'text';
  },
  toDriver(value) {
    return value.toLowerCase();
  },
  fromDriver(value) {
    return value.toLowerCase() as Hex;
  },
});

// Ponder stores uint64/uint256 fields as `numeric(78,0)` (room for a full
// uint256). postgres-js surfaces numeric as a string; we lift to bigint so
// callers can compare with `>` / `<` and use bigint literals in queries.
const ponderBigint = customType<{ data: bigint; driverData: string }>({
  dataType() {
    return 'numeric(78,0)';
  },
  toDriver(value) {
    return value.toString();
  },
  fromDriver(value) {
    return BigInt(value);
  },
});

// Ponder's onchainEnum('classification', [...]) renders the enum values as
// ['Unknown', 'Verified', 'Malicious']. We lower-case them at read time to
// match @setcode/shared's `Classification` union.
const ponderClassification = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'classification';
  },
  fromDriver(value) {
    return value.toLowerCase();
  },
});

// Ponder 0.16 emits column names in snake_case (e.g. `current_target`,
// `block_number`). The JS-side property names stay camelCase via Drizzle's
// (sqlName, ...) -> property mapping. If a future Ponder release switches
// emission, only the first-arg strings here change.
export const delegationEvent = ponderTable('delegation_event', {
  id: text('id').primaryKey(),
  eoa: ponderHex('eoa').notNull(),
  previousTarget: ponderHex('previous_target'),
  newTarget: ponderHex('new_target'),
  chainId: integer('chain_id').notNull(),
  blockNumber: ponderBigint('block_number').notNull(),
  timestamp: ponderBigint('timestamp').notNull(),
  txHash: ponderHex('tx_hash').notNull(),
});

// Current delegation state per (eoa, chainId). Written by the indexer's
// block-scanner handler. A null `currentTarget` means the EOA revoked its
// delegation. Rows are only upserted after we've seen the EOA delegate at
// least once — absence means "never delegated in the indexed window".
export const delegationState = ponderTable('delegation_state', {
  eoa: ponderHex('eoa').notNull(),
  chainId: integer('chain_id').notNull(),
  currentTarget: ponderHex('current_target'),
  lastUpdated: ponderBigint('last_updated').notNull(),
});

export const registryClassificationState = ponderTable('registry_classification_state', {
  target: ponderHex('target').primaryKey(),
  current: ponderClassification('current').notNull(),
  reason: text('reason').notNull(),
  updatedAt: ponderBigint('updated_at').notNull(),
});

// onChainSubscriptionState — used later when we gate alerts on whether the
// EOA has an active on-chain subscription via DelegationCanary. Included in
// the read schema now so the classification service can evolve without
// touching this file.
export const onChainSubscriptionState = ponderTable('on_chain_subscription_state', {
  eoa: ponderHex('eoa').primaryKey(),
  active: boolean('active').notNull(),
  channelHash: ponderHex('channel_hash'),
  updatedAt: ponderBigint('updated_at').notNull(),
});

export type DelegationEventRow = typeof delegationEvent.$inferSelect;
export type RegistryClassificationStateRow = typeof registryClassificationState.$inferSelect;
