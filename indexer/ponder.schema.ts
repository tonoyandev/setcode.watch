import { hex, onchainEnum, onchainTable, primaryKey } from 'ponder';

export const classification = onchainEnum('classification', ['Unknown', 'Verified', 'Malicious']);

export const delegationEvent = onchainTable('delegation_event', (t) => ({
  id: t.text().primaryKey(),
  eoa: hex().notNull(),
  previousTarget: hex(),
  newTarget: hex(),
  chainId: t.integer().notNull(),
  blockNumber: t.bigint().notNull(),
  timestamp: t.bigint().notNull(),
  txHash: hex().notNull(),
}));

export const delegationState = onchainTable(
  'delegation_state',
  (t) => ({
    eoa: hex().notNull(),
    chainId: t.integer().notNull(),
    currentTarget: hex(),
    lastUpdated: t.bigint().notNull(),
  }),
  (table) => ({
    pk: primaryKey({ columns: [table.eoa, table.chainId] }),
  }),
);

export const onChainSubscription = onchainTable('on_chain_subscription', (t) => ({
  id: t.text().primaryKey(),
  eoa: hex().notNull(),
  channelHash: hex(),
  active: t.boolean().notNull(),
  blockNumber: t.bigint().notNull(),
  timestamp: t.bigint().notNull(),
  txHash: hex().notNull(),
}));

export const onChainSubscriptionState = onchainTable('on_chain_subscription_state', (t) => ({
  eoa: hex().primaryKey(),
  active: t.boolean().notNull(),
  channelHash: hex(),
  updatedAt: t.bigint().notNull(),
}));

export const registryClassification = onchainTable('registry_classification', (t) => ({
  id: t.text().primaryKey(),
  target: hex().notNull(),
  classification: classification().notNull(),
  reason: t.text().notNull(),
  isDowngrade: t.boolean().notNull(),
  blockNumber: t.bigint().notNull(),
  timestamp: t.bigint().notNull(),
  txHash: hex().notNull(),
}));

export const registryClassificationState = onchainTable('registry_classification_state', (t) => ({
  target: hex().primaryKey(),
  current: classification().notNull(),
  reason: t.text().notNull(),
  updatedAt: t.bigint().notNull(),
}));
