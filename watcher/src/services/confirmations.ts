import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import type { Address } from 'viem';
import type { Db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { newConfirmationCode } from '../lib/code.js';

export type WatcherDb = Db;

export interface ConfirmationsServiceOptions {
  confirmationTtlSeconds: number;
  // Cap on distinct EOAs per chat. Subscribing to one EOA on every
  // monitored chain counts as a single slot — the cap protects the chat
  // from bot-noise + DB bloat, not from chain coverage.
  maxSubscriptionsPerChat: number;
  now?: () => Date;
}

export interface CreatePendingResult {
  code: string;
  expiresAt: Date;
}

// `confirm` returns enough detail for the bot to render an accurate
// success message: which chains were freshly subscribed vs. which the
// chat was already watching for the same EOA. The two arrays partition
// the requested chainIds set; both can be non-empty (e.g. user already
// had Ethereum, asked for all four → addedChainIds=[10,8453,42161],
// alreadyChainIds=[1]).
export type ConfirmResult =
  | {
      kind: 'ok';
      eoa: Address;
      addedChainIds: number[];
      alreadyChainIds: number[];
    }
  | {
      kind: 'already_subscribed';
      eoa: Address;
      chainIds: number[];
    }
  | { kind: 'cap_reached'; max: number }
  | { kind: 'expired' }
  | { kind: 'not_found' };

export interface SubscriptionSummary {
  eoa: Address;
  chainId: number;
  confirmedAt: Date;
}

export function createConfirmationsService(db: WatcherDb, options: ConfirmationsServiceOptions) {
  const now = options.now ?? (() => new Date());

  async function createPending(input: {
    eoa: Address;
    // Always at least one — the HTTP layer defaults missing/empty to
    // every supported chain id, which is the architectural shape of the
    // bell-button flow.
    chainIds: number[];
  }): Promise<CreatePendingResult> {
    if (input.chainIds.length === 0) {
      // Defensive: matches the DB CHECK constraint. Caller bug.
      throw new Error('createPending: chainIds must be non-empty');
    }
    const expiresAt = new Date(now().getTime() + options.confirmationTtlSeconds * 1000);
    const code = newConfirmationCode();
    // Deduplicate so a `[1, 1]` request doesn't create a row that fans
    // out to two identical inserts at confirm time (which would no-op
    // on the unique index, but is cleaner to drop here).
    const dedup = Array.from(new Set(input.chainIds));
    await db.insert(schema.pendingConfirmations).values({
      code,
      eoa: input.eoa,
      chainIds: dedup,
      expiresAt,
    });
    return { code, expiresAt };
  }

  async function confirm(input: {
    code: string;
    chatId: bigint;
    username: string | null;
  }): Promise<ConfirmResult> {
    const [pending] = await db
      .select()
      .from(schema.pendingConfirmations)
      .where(eq(schema.pendingConfirmations.code, input.code))
      .limit(1);

    if (!pending) return { kind: 'not_found' };

    if (pending.expiresAt.getTime() <= now().getTime()) {
      await db
        .delete(schema.pendingConfirmations)
        .where(eq(schema.pendingConfirmations.code, input.code));
      return { kind: 'expired' };
    }

    const eoa = pending.eoa as Address;
    const requestedChainIds = pending.chainIds;

    // What does this chat already have for this EOA across the requested
    // chain set? Splits into "already subscribed" (skip) vs "to insert".
    const existingRows = await db
      .select({ chainId: schema.subscriptions.chainId })
      .from(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.eoa, eoa),
          eq(schema.subscriptions.telegramChatId, input.chatId),
          eq(schema.subscriptions.confirmed, true),
          inArray(schema.subscriptions.chainId, requestedChainIds),
        ),
      );
    const alreadyChainIds = existingRows.map((r) => r.chainId);
    const alreadySet = new Set(alreadyChainIds);
    const addedChainIds = requestedChainIds.filter((id) => !alreadySet.has(id));

    if (addedChainIds.length === 0) {
      // Nothing to do — the chat is already watching this EOA on every
      // requested chain. Drop the pending row, tell the caller.
      await db
        .delete(schema.pendingConfirmations)
        .where(eq(schema.pendingConfirmations.code, input.code));
      return { kind: 'already_subscribed', eoa, chainIds: requestedChainIds };
    }

    // Cap counts distinct EOAs the chat is watching. Adding rows for an
    // EOA the chat already follows on a different chain doesn't consume
    // a slot — the cap is about user attention, not row count.
    const distinctEoaRows = await db
      .selectDistinct({ eoa: schema.subscriptions.eoa })
      .from(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.telegramChatId, input.chatId),
          eq(schema.subscriptions.confirmed, true),
        ),
      );
    const distinctEoas = new Set(distinctEoaRows.map((r) => r.eoa.toLowerCase()));
    const wouldGrowCap = !distinctEoas.has(eoa.toLowerCase());
    if (wouldGrowCap && distinctEoas.size >= options.maxSubscriptionsPerChat) {
      return { kind: 'cap_reached', max: options.maxSubscriptionsPerChat };
    }

    // Fan out: insert one subscription row per added chain id. We still
    // honour any pre-existing unconfirmed rows (legacy flow) by upserting.
    await db
      .insert(schema.subscriptions)
      .values(
        addedChainIds.map((chainId) => ({
          eoa,
          chainId,
          telegramChatId: input.chatId,
          telegramUsername: input.username,
          confirmed: true,
          confirmedAt: now(),
        })),
      )
      .onConflictDoUpdate({
        target: [
          schema.subscriptions.eoa,
          schema.subscriptions.chainId,
          schema.subscriptions.telegramChatId,
        ],
        set: {
          confirmed: true,
          confirmedAt: now(),
          telegramUsername: sql`EXCLUDED.telegram_username`,
        },
      });

    await db
      .delete(schema.pendingConfirmations)
      .where(eq(schema.pendingConfirmations.code, input.code));

    return { kind: 'ok', eoa, addedChainIds, alreadyChainIds };
  }

  async function list(chatId: bigint): Promise<SubscriptionSummary[]> {
    const rows = await db
      .select({
        eoa: schema.subscriptions.eoa,
        chainId: schema.subscriptions.chainId,
        confirmedAt: schema.subscriptions.confirmedAt,
      })
      .from(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.telegramChatId, chatId),
          eq(schema.subscriptions.confirmed, true),
        ),
      );
    return rows
      .filter(
        (r): r is { eoa: string; chainId: number; confirmedAt: Date } => r.confirmedAt !== null,
      )
      .map((r) => ({ eoa: r.eoa as Address, chainId: r.chainId, confirmedAt: r.confirmedAt }));
  }

  async function remove(input: {
    eoa: Address;
    chainId: number;
    chatId: bigint;
  }): Promise<boolean> {
    const deleted = await db
      .delete(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.eoa, input.eoa),
          eq(schema.subscriptions.chainId, input.chainId),
          eq(schema.subscriptions.telegramChatId, input.chatId),
          eq(schema.subscriptions.confirmed, true),
        ),
      )
      .returning({ id: schema.subscriptions.id });
    return deleted.length > 0;
  }

  async function sweepExpired(): Promise<number> {
    const deleted = await db
      .delete(schema.pendingConfirmations)
      .where(lt(schema.pendingConfirmations.expiresAt, now()))
      .returning({ code: schema.pendingConfirmations.code });
    return deleted.length;
  }

  return { createPending, confirm, list, remove, sweepExpired };
}

export type ConfirmationsService = ReturnType<typeof createConfirmationsService>;
