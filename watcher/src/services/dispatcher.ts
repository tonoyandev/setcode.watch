import { and, asc, eq, gt, inArray, lt, or, sql } from 'drizzle-orm';
import type { Address, Hex } from 'viem';
import type { Db } from '../db/client.js';
import * as ponderSchema from '../db/ponder-read.js';
import * as watcherSchema from '../db/schema.js';
import type { SendOutcome, TelegramClient } from '../telegram/client.js';
import type { ClassificationService } from './classification.js';
import { buildAlertMessage } from './messages.js';

// DispatcherDb sees both Ponder read-side tables and watcher-owned tables.
// The runtime wires a single drizzle instance that merges both schemas.
export type DispatcherDb = Db;

const CURSOR_ID = 1;

export interface DispatcherServiceOptions {
  batchSize: number;
  retentionDays: number;
  retentionBatchSize: number;
  now?: () => Date;
}

export interface DispatcherDeps {
  db: DispatcherDb;
  telegram: TelegramClient;
  classification: ClassificationService;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

export interface ProcessBatchResult {
  events: number;
  sent: number;
  permanentFailures: number;
  transientFailures: number;
  advanced: boolean;
}

export interface RetentionSweepResult {
  deleted: number;
  iterations: number;
}

function cursorOrdering() {
  // Ponder event ids are lexicographically comparable within a block
  // (block-padded). Globally we order by (block_number, id) — any two events
  // with the same block number disambiguate on id; different blocks are
  // totally ordered by block_number.
  return [asc(ponderSchema.delegationEvent.blockNumber), asc(ponderSchema.delegationEvent.id)];
}

function afterCursor(lastBlock: bigint, lastId: string) {
  return or(
    gt(ponderSchema.delegationEvent.blockNumber, lastBlock),
    and(
      eq(ponderSchema.delegationEvent.blockNumber, lastBlock),
      gt(ponderSchema.delegationEvent.id, lastId),
    ),
  );
}

export function createDispatcherService(deps: DispatcherDeps, options: DispatcherServiceOptions) {
  const { db, telegram, classification } = deps;
  const log = deps.logger ?? console;
  const now = options.now ?? (() => new Date());

  async function readCursor(): Promise<{ lastBlock: bigint; lastId: string } | null> {
    const [row] = await db
      .select({
        lastBlock: watcherSchema.dispatcherCursor.lastBlock,
        lastId: watcherSchema.dispatcherCursor.lastId,
      })
      .from(watcherSchema.dispatcherCursor)
      .where(eq(watcherSchema.dispatcherCursor.id, CURSOR_ID))
      .limit(1);
    return row ?? null;
  }

  // On first boot the dispatcher_cursor row is absent. We initialise it to the
  // current head of delegation_event so historical events (which users did not
  // subscribe for) do not fan out as alerts. If there are no events yet the
  // cursor is seeded at (0, '').
  async function initialiseCursorIfMissing(): Promise<void> {
    const existing = await readCursor();
    if (existing) return;

    const [head] = await db
      .select({
        blockNumber: ponderSchema.delegationEvent.blockNumber,
        id: ponderSchema.delegationEvent.id,
      })
      .from(ponderSchema.delegationEvent)
      .orderBy(
        sql`${ponderSchema.delegationEvent.blockNumber} DESC`,
        sql`${ponderSchema.delegationEvent.id} DESC`,
      )
      .limit(1);

    const seedBlock = head?.blockNumber ?? 0n;
    const seedId = head?.id ?? '';
    await db
      .insert(watcherSchema.dispatcherCursor)
      .values({ id: CURSOR_ID, lastBlock: seedBlock, lastId: seedId })
      .onConflictDoNothing();
    log.info(
      `[dispatcher] cursor initialised at (block=${seedBlock}, id=${seedId || '<genesis>'})`,
    );
  }

  // One tick of the dispatch loop: fetch up to `batchSize` events beyond the
  // cursor, fan them out, and advance the cursor. Returns counters so the
  // caller / tests can assert behaviour.
  async function processBatch(): Promise<ProcessBatchResult> {
    const cursor = await readCursor();
    if (!cursor) {
      throw new Error('[dispatcher] cursor missing; call initialiseCursorIfMissing() first');
    }

    const events = await db
      .select({
        id: ponderSchema.delegationEvent.id,
        eoa: ponderSchema.delegationEvent.eoa,
        previousTarget: ponderSchema.delegationEvent.previousTarget,
        newTarget: ponderSchema.delegationEvent.newTarget,
        chainId: ponderSchema.delegationEvent.chainId,
        blockNumber: ponderSchema.delegationEvent.blockNumber,
        txHash: ponderSchema.delegationEvent.txHash,
      })
      .from(ponderSchema.delegationEvent)
      .where(afterCursor(cursor.lastBlock, cursor.lastId))
      .orderBy(...cursorOrdering())
      .limit(options.batchSize);

    const result: ProcessBatchResult = {
      events: 0,
      sent: 0,
      permanentFailures: 0,
      transientFailures: 0,
      advanced: false,
    };

    for (const event of events) {
      result.events += 1;

      const eoa = event.eoa.toLowerCase() as Address;
      // Subscriptions are per-chain: a user watching this EOA on Ethereum
      // must NOT receive alerts when the same EOA delegates on Base. We
      // filter on event.chainId so each chain's events fan out only to
      // its own subscribers.
      const subs = await db
        .select({
          telegramChatId: watcherSchema.subscriptions.telegramChatId,
        })
        .from(watcherSchema.subscriptions)
        .where(
          and(
            eq(watcherSchema.subscriptions.eoa, eoa),
            eq(watcherSchema.subscriptions.chainId, event.chainId),
            eq(watcherSchema.subscriptions.confirmed, true),
          ),
        );

      if (subs.length === 0) {
        await advanceCursor(event.blockNumber, event.id);
        result.advanced = true;
        continue;
      }

      // Preflight: exclude chats we have already alerted for this tx. Safe
      // even if a previous tick partially crashed mid-send.
      const already = await db
        .select({ chatId: watcherSchema.alertsSent.telegramChatId })
        .from(watcherSchema.alertsSent)
        .where(
          and(
            eq(watcherSchema.alertsSent.txHash, event.txHash),
            inArray(
              watcherSchema.alertsSent.telegramChatId,
              subs.map((s) => s.telegramChatId),
            ),
          ),
        );
      const alreadySet = new Set(already.map((a) => a.chatId));
      const remaining = subs.filter((s) => !alreadySet.has(s.telegramChatId));

      let sawTransient = false;

      if (remaining.length > 0) {
        const classifications = await classification.resolveMany([
          event.previousTarget as Address | null,
          event.newTarget as Address | null,
        ]);
        const oldClassification =
          event.previousTarget === null
            ? 'unknown'
            : (classifications.get(event.previousTarget.toLowerCase()) ?? 'unknown');
        const newClassification =
          event.newTarget === null
            ? 'unknown'
            : (classifications.get(event.newTarget.toLowerCase()) ?? 'unknown');

        const message = buildAlertMessage({
          eoa,
          oldTarget: event.previousTarget as Address | null,
          newTarget: event.newTarget as Address | null,
          oldClassification,
          newClassification,
          chainId: event.chainId,
          txHash: event.txHash as Hex,
        });

        for (const sub of remaining) {
          const outcome: SendOutcome = await telegram.sendMessage({
            chatId: sub.telegramChatId,
            html: message.html,
          });
          if (outcome.kind === 'ok') {
            await db
              .insert(watcherSchema.alertsSent)
              .values({
                eoa,
                telegramChatId: sub.telegramChatId,
                txHash: event.txHash,
                oldTarget: event.previousTarget,
                newTarget: event.newTarget,
                oldClassification,
                newClassification,
                chainId: event.chainId,
                blockNumber: event.blockNumber,
                sentAt: now(),
              })
              .onConflictDoNothing();
            result.sent += 1;
          } else if (outcome.kind === 'permanent') {
            log.warn(
              `[dispatcher] permanent send failure chat=${sub.telegramChatId} tx=${event.txHash}: ${outcome.reason}`,
            );
            result.permanentFailures += 1;
          } else {
            log.warn(
              `[dispatcher] transient send failure chat=${sub.telegramChatId} tx=${event.txHash}: ${outcome.reason}`,
            );
            result.transientFailures += 1;
            sawTransient = true;
          }
        }
      }

      if (sawTransient) {
        // Do not advance the cursor. Already-delivered chats are protected
        // by the preflight + UNIQUE(tx_hash, telegram_chat_id) on the next
        // retry.
        break;
      }

      await advanceCursor(event.blockNumber, event.id);
      result.advanced = true;
    }

    return result;
  }

  async function advanceCursor(blockNumber: bigint, id: string): Promise<void> {
    await db
      .update(watcherSchema.dispatcherCursor)
      .set({ lastBlock: blockNumber, lastId: id, updatedAt: now() })
      .where(eq(watcherSchema.dispatcherCursor.id, CURSOR_ID));
  }

  // Batched retention deletion. We cap each DELETE at retentionBatchSize so
  // long locks don't stall concurrent inserts by the dispatcher itself. The
  // loop exits as soon as a sweep deletes zero rows.
  async function runRetentionSweep(): Promise<RetentionSweepResult> {
    const cutoff = new Date(now().getTime() - options.retentionDays * 86_400_000);
    let deleted = 0;
    let iterations = 0;
    for (;;) {
      iterations += 1;
      const victims = await db
        .select({ id: watcherSchema.alertsSent.id })
        .from(watcherSchema.alertsSent)
        .where(lt(watcherSchema.alertsSent.sentAt, cutoff))
        .limit(options.retentionBatchSize);
      if (victims.length === 0) break;

      const ids = victims.map((v) => v.id);
      const removed = await db
        .delete(watcherSchema.alertsSent)
        .where(inArray(watcherSchema.alertsSent.id, ids))
        .returning({ id: watcherSchema.alertsSent.id });
      deleted += removed.length;
      if (removed.length < options.retentionBatchSize) break;
    }
    return { deleted, iterations };
  }

  return { initialiseCursorIfMissing, processBatch, runRetentionSweep, readCursor };
}

export type DispatcherService = ReturnType<typeof createDispatcherService>;
