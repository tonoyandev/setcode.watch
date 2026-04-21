import { and, eq, lt } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type { Address } from 'viem';
import * as schema from '../db/schema.js';
import { newConfirmationCode } from '../lib/code.js';

export type WatcherDb = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface ConfirmationsServiceOptions {
  confirmationTtlSeconds: number;
  maxSubscriptionsPerChat: number;
  now?: () => Date;
}

export interface CreatePendingResult {
  code: string;
  expiresAt: Date;
}

export type ConfirmResult =
  | { kind: 'ok'; eoa: Address }
  | { kind: 'already_subscribed'; eoa: Address }
  | { kind: 'cap_reached'; max: number }
  | { kind: 'expired' }
  | { kind: 'not_found' };

export interface SubscriptionSummary {
  eoa: Address;
  confirmedAt: Date;
}

export function createConfirmationsService(db: WatcherDb, options: ConfirmationsServiceOptions) {
  const now = options.now ?? (() => new Date());

  async function createPending(input: { eoa: Address }): Promise<CreatePendingResult> {
    const expiresAt = new Date(now().getTime() + options.confirmationTtlSeconds * 1000);
    const code = newConfirmationCode();
    await db.insert(schema.pendingConfirmations).values({
      code,
      eoa: input.eoa,
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

    const [existing] = await db
      .select()
      .from(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.eoa, eoa),
          eq(schema.subscriptions.telegramChatId, input.chatId),
        ),
      )
      .limit(1);

    if (existing?.confirmed) {
      await db
        .delete(schema.pendingConfirmations)
        .where(eq(schema.pendingConfirmations.code, input.code));
      return { kind: 'already_subscribed', eoa };
    }

    const confirmed = await db
      .select({ id: schema.subscriptions.id })
      .from(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.telegramChatId, input.chatId),
          eq(schema.subscriptions.confirmed, true),
        ),
      );

    if (confirmed.length >= options.maxSubscriptionsPerChat) {
      return { kind: 'cap_reached', max: options.maxSubscriptionsPerChat };
    }

    if (existing) {
      await db
        .update(schema.subscriptions)
        .set({
          confirmed: true,
          confirmedAt: now(),
          telegramUsername: input.username,
        })
        .where(eq(schema.subscriptions.id, existing.id));
    } else {
      await db.insert(schema.subscriptions).values({
        eoa,
        telegramChatId: input.chatId,
        telegramUsername: input.username,
        confirmed: true,
        confirmedAt: now(),
      });
    }

    await db
      .delete(schema.pendingConfirmations)
      .where(eq(schema.pendingConfirmations.code, input.code));

    return { kind: 'ok', eoa };
  }

  async function list(chatId: bigint): Promise<SubscriptionSummary[]> {
    const rows = await db
      .select({
        eoa: schema.subscriptions.eoa,
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
      .filter((r): r is { eoa: string; confirmedAt: Date } => r.confirmedAt !== null)
      .map((r) => ({ eoa: r.eoa as Address, confirmedAt: r.confirmedAt }));
  }

  async function remove(input: { eoa: Address; chatId: bigint }): Promise<boolean> {
    const deleted = await db
      .delete(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.eoa, input.eoa),
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
