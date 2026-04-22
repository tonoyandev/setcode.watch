import { bigint, boolean, customType, integer, pgTable, text } from 'drizzle-orm/pg-core';
import { type Hex, bytesToHex, hexToBytes } from 'viem';

// Ponder's `hex()` column type is backed by bytea. Drizzle's postgres-js
// driver surfaces bytea as a Uint8Array; we flip it back to a lowercase
// `0x…` string so the dispatcher never has to think about byte arrays.
const ponderHex = customType<{ data: Hex; driverData: Uint8Array }>({
  dataType() {
    return 'bytea';
  },
  toDriver(value) {
    return hexToBytes(value);
  },
  fromDriver(value) {
    return bytesToHex(value).toLowerCase() as Hex;
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

// TODO(verify): Ponder 0.x stores column names verbatim as declared in
// onchainTable (camelCase). If a future Ponder version switches to
// snake_case, add explicit .name() calls here. Table names already use the
// snake_case string we pass to onchainTable().
export const delegationEvent = pgTable('delegation_event', {
  id: text('id').primaryKey(),
  eoa: ponderHex('eoa').notNull(),
  previousTarget: ponderHex('previousTarget'),
  newTarget: ponderHex('newTarget'),
  chainId: integer('chainId').notNull(),
  blockNumber: bigint('blockNumber', { mode: 'bigint' }).notNull(),
  timestamp: bigint('timestamp', { mode: 'bigint' }).notNull(),
  txHash: ponderHex('txHash').notNull(),
});

// Current delegation state per (eoa, chainId). Written by the indexer's
// block-scanner handler. A null `currentTarget` means the EOA revoked its
// delegation. Rows are only upserted after we've seen the EOA delegate at
// least once — absence means "never delegated in the indexed window".
export const delegationState = pgTable('delegation_state', {
  eoa: ponderHex('eoa').notNull(),
  chainId: integer('chainId').notNull(),
  currentTarget: ponderHex('currentTarget'),
  lastUpdated: bigint('lastUpdated', { mode: 'bigint' }).notNull(),
});

export const registryClassificationState = pgTable('registry_classification_state', {
  target: ponderHex('target').primaryKey(),
  current: ponderClassification('current').notNull(),
  reason: text('reason').notNull(),
  updatedAt: bigint('updatedAt', { mode: 'bigint' }).notNull(),
});

// onChainSubscriptionState — used later when we gate alerts on whether the
// EOA has an active on-chain subscription via DelegationCanary. Included in
// the read schema now so the classification service can evolve without
// touching this file.
export const onChainSubscriptionState = pgTable('on_chain_subscription_state', {
  eoa: ponderHex('eoa').primaryKey(),
  active: boolean('active').notNull(),
  channelHash: ponderHex('channelHash'),
  updatedAt: bigint('updatedAt', { mode: 'bigint' }).notNull(),
});

export type DelegationEventRow = typeof delegationEvent.$inferSelect;
export type RegistryClassificationStateRow = typeof registryClassificationState.$inferSelect;
