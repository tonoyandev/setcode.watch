import { and, eq, isNull } from 'drizzle-orm';
import type { Address } from 'viem';
import type { Db } from '../db/client.js';
import * as schema from '../db/schema.js';
import type { SubscriptionSummary } from './confirmations.js';

export interface ManageServiceOptions {
  webBaseUrl: string;
  // Overridable for deterministic tests.
  newToken?: () => string;
  now?: () => Date;
}

export interface IssueResult {
  token: string;
  url: string;
}

export type ManageLookup =
  | { kind: 'ok'; chatId: bigint; subscriptions: SubscriptionSummary[] }
  | { kind: 'not_found' };

export type ManageRemoveResult = { kind: 'ok'; removed: boolean } | { kind: 'not_found' };

// Opaque token flow for the /manage web page. A chat issues a token via the
// bot's `/manage` command; handing that token to the UI authorises listing
// and removing the chat's confirmed EOAs without ever exposing the chat_id
// to the caller. Issuing a new token revokes any previous active ones for
// the same chat so a single shareable link is always current.
export function createManageService(db: Db, options: ManageServiceOptions) {
  const now = options.now ?? (() => new Date());
  const newToken = options.newToken ?? (() => globalThis.crypto.randomUUID());

  function urlFor(token: string): string {
    const base = options.webBaseUrl.replace(/\/+$/, '');
    return `${base}/manage/${token}`;
  }

  async function issue(chatId: bigint): Promise<IssueResult> {
    await db
      .update(schema.manageTokens)
      .set({ revokedAt: now() })
      .where(
        and(eq(schema.manageTokens.telegramChatId, chatId), isNull(schema.manageTokens.revokedAt)),
      );
    const token = newToken();
    await db.insert(schema.manageTokens).values({ token, telegramChatId: chatId });
    return { token, url: urlFor(token) };
  }

  async function resolve(token: string): Promise<bigint | null> {
    const [row] = await db
      .select({
        chatId: schema.manageTokens.telegramChatId,
        revokedAt: schema.manageTokens.revokedAt,
      })
      .from(schema.manageTokens)
      .where(eq(schema.manageTokens.token, token))
      .limit(1);
    if (!row || row.revokedAt !== null) return null;
    return row.chatId;
  }

  async function listSubscriptions(token: string): Promise<ManageLookup> {
    const chatId = await resolve(token);
    if (chatId === null) return { kind: 'not_found' };
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
    const subscriptions = rows
      .filter((r): r is { eoa: string; confirmedAt: Date } => r.confirmedAt !== null)
      .map((r) => ({ eoa: r.eoa as Address, confirmedAt: r.confirmedAt }));
    return { kind: 'ok', chatId, subscriptions };
  }

  async function removeSubscription(token: string, eoa: Address): Promise<ManageRemoveResult> {
    const chatId = await resolve(token);
    if (chatId === null) return { kind: 'not_found' };
    const deleted = await db
      .delete(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.eoa, eoa),
          eq(schema.subscriptions.telegramChatId, chatId),
          eq(schema.subscriptions.confirmed, true),
        ),
      )
      .returning({ id: schema.subscriptions.id });
    return { kind: 'ok', removed: deleted.length > 0 };
  }

  async function revoke(token: string): Promise<boolean> {
    const updated = await db
      .update(schema.manageTokens)
      .set({ revokedAt: now() })
      .where(and(eq(schema.manageTokens.token, token), isNull(schema.manageTokens.revokedAt)))
      .returning({ token: schema.manageTokens.token });
    return updated.length > 0;
  }

  return { issue, resolve, listSubscriptions, removeSubscription, revoke };
}

export type ManageService = ReturnType<typeof createManageService>;
