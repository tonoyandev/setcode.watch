import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

const EOA_LOWERHEX = sql`eoa ~ '^0x[0-9a-f]{40}$'`;
const TARGET_LOWERHEX = (col: 'old_target' | 'new_target') =>
  sql`(${sql.raw(col)} IS NULL OR ${sql.raw(col)} ~ '^0x[0-9a-f]{40}$')`;
const TX_HASH_LOWERHEX = sql`tx_hash ~ '^0x[0-9a-f]{64}$'`;

const CLASSIFICATION_VALUES = sql`('unknown', 'verified', 'malicious')`;

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: serial('id').primaryKey(),
    eoa: text('eoa').notNull(),
    telegramChatId: bigint('telegram_chat_id', { mode: 'bigint' }).notNull(),
    telegramUsername: text('telegram_username'),
    confirmed: boolean('confirmed').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  },
  (t) => ({
    uqEoaChat: uniqueIndex('subscriptions_eoa_chat_uq').on(t.eoa, t.telegramChatId),
    ixEoa: index('subscriptions_eoa_ix').on(t.eoa),
    ixChat: index('subscriptions_chat_ix').on(t.telegramChatId),
    ckEoaFormat: check('subscriptions_eoa_lowerhex_ck', EOA_LOWERHEX),
  }),
);

// pending_confirmations holds unbound codes. The chat id is unknown at
// creation (web-first flow: user types EOA → site generates code → user
// clicks Telegram deep-link → bot captures chat id on /start) and is
// written onto the subscriptions row at confirmation time.
export const pendingConfirmations = pgTable(
  'pending_confirmations',
  {
    code: text('code').primaryKey(),
    eoa: text('eoa').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => ({
    ixExpires: index('pending_confirmations_expires_ix').on(t.expiresAt),
    ixEoa: index('pending_confirmations_eoa_ix').on(t.eoa),
    ckEoaFormat: check('pending_confirmations_eoa_lowerhex_ck', EOA_LOWERHEX),
  }),
);

export const alertsSent = pgTable(
  'alerts_sent',
  {
    id: serial('id').primaryKey(),
    eoa: text('eoa').notNull(),
    telegramChatId: bigint('telegram_chat_id', { mode: 'bigint' }).notNull(),
    txHash: text('tx_hash').notNull(),
    oldTarget: text('old_target'),
    newTarget: text('new_target'),
    oldClassification: text('old_classification').notNull(),
    newClassification: text('new_classification').notNull(),
    chainId: integer('chain_id').notNull(),
    blockNumber: bigint('block_number', { mode: 'bigint' }).notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uqTxChat: uniqueIndex('alerts_sent_tx_chat_uq').on(t.txHash, t.telegramChatId),
    ixSentAt: index('alerts_sent_sent_at_ix').on(t.sentAt),
    ixEoa: index('alerts_sent_eoa_ix').on(t.eoa),
    ckEoaFormat: check('alerts_sent_eoa_lowerhex_ck', EOA_LOWERHEX),
    ckTxHash: check('alerts_sent_tx_hash_lowerhex_ck', TX_HASH_LOWERHEX),
    ckOldTarget: check('alerts_sent_old_target_lowerhex_ck', TARGET_LOWERHEX('old_target')),
    ckNewTarget: check('alerts_sent_new_target_lowerhex_ck', TARGET_LOWERHEX('new_target')),
    ckOldClassification: check(
      'alerts_sent_old_classification_ck',
      sql`old_classification IN ${CLASSIFICATION_VALUES}`,
    ),
    ckNewClassification: check(
      'alerts_sent_new_classification_ck',
      sql`new_classification IN ${CLASSIFICATION_VALUES}`,
    ),
  }),
);

// Singleton cursor (id always 1) tracking the last delegation_event the
// dispatcher has processed. We order Ponder events by (block_number, id)
// and advance this row after each event's alerts_sent writes settle.
// First-boot initialisation sets the cursor to the current head so that
// historical events do not fan out as alerts.
export const dispatcherCursor = pgTable('dispatcher_cursor', {
  id: integer('id').primaryKey(),
  lastBlock: bigint('last_block', { mode: 'bigint' }).notNull(),
  lastId: text('last_id').notNull(),
  initialisedAt: timestamp('initialised_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const manageTokens = pgTable(
  'manage_tokens',
  {
    token: text('token').primaryKey(),
    telegramChatId: bigint('telegram_chat_id', { mode: 'bigint' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => ({
    ixChat: index('manage_tokens_chat_ix').on(t.telegramChatId),
  }),
);

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type PendingConfirmation = typeof pendingConfirmations.$inferSelect;
export type NewPendingConfirmation = typeof pendingConfirmations.$inferInsert;
export type AlertSent = typeof alertsSent.$inferSelect;
export type NewAlertSent = typeof alertsSent.$inferInsert;
export type ManageToken = typeof manageTokens.$inferSelect;
export type NewManageToken = typeof manageTokens.$inferInsert;
export type DispatcherCursor = typeof dispatcherCursor.$inferSelect;
export type NewDispatcherCursor = typeof dispatcherCursor.$inferInsert;
