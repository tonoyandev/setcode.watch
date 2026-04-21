import { Telegram } from 'telegraf';

// The dispatcher needs *send-only* access to Telegram; it must never block on
// long-polling updates (the bot module already owns that channel). Wrapping
// `telegraf`'s low-level Telegram client keeps retries and error classification
// in one place and lets tests inject a fake without spinning up an HTTP mock.

export type SendOutcome =
  | { kind: 'ok' }
  | { kind: 'permanent'; reason: string }
  | { kind: 'transient'; reason: string };

export interface TelegramClient {
  sendMessage(input: { chatId: bigint; html: string }): Promise<SendOutcome>;
}

// Telegram's Bot API returns HTTP 403 / 400 for chats the bot can no longer
// reach (user blocked the bot, left the group, deactivated account). These
// are *permanent* — we should record the failure and skip instead of retry.
// Everything else — 429, 5xx, network — is *transient* and bubbles up so the
// caller can decide whether to back off or retry in the next tick.
const PERMANENT_DESCRIPTIONS = [
  'Forbidden: bot was blocked by the user',
  'Forbidden: user is deactivated',
  'Forbidden: bot was kicked',
  'Forbidden: the group chat was deleted',
  'Bad Request: chat not found',
];

function classifyError(err: unknown): SendOutcome {
  const description =
    typeof err === 'object' && err !== null && 'description' in err
      ? String((err as { description: unknown }).description)
      : err instanceof Error
        ? err.message
        : String(err);

  for (const phrase of PERMANENT_DESCRIPTIONS) {
    if (description.includes(phrase)) {
      return { kind: 'permanent', reason: description };
    }
  }
  return { kind: 'transient', reason: description };
}

export function createTelegramClient(token: string): TelegramClient {
  const tg = new Telegram(token);
  return {
    async sendMessage({ chatId, html }) {
      try {
        await tg.sendMessage(Number(chatId), html, {
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
        });
        return { kind: 'ok' };
      } catch (err) {
        return classifyError(err);
      }
    },
  };
}
