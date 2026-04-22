import { customAlphabet } from 'nanoid';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
export const CONFIRMATION_CODE_LENGTH = 16;
export const CONFIRMATION_CODE_PREFIX = 'c_';

// Second start-payload family: a one-off "peek" into the classification of
// an EOA. The web client builds `t.me/<bot>?start=w_<0x40-hex>` and the bot
// replies with the current state — no binding, no persistence. Separate
// prefix keeps it unambiguous vs. the confirmation code flow.
export const WATCH_PAYLOAD_PREFIX = 'w_';
export const WATCH_PAYLOAD_ADDRESS_LENGTH = 42; // 0x + 40 hex chars

const generate = customAlphabet(ALPHABET, CONFIRMATION_CODE_LENGTH);

export function newConfirmationCode(): string {
  return `${CONFIRMATION_CODE_PREFIX}${generate()}`;
}

export function isConfirmationCode(candidate: string): boolean {
  if (!candidate.startsWith(CONFIRMATION_CODE_PREFIX)) return false;
  const body = candidate.slice(CONFIRMATION_CODE_PREFIX.length);
  if (body.length !== CONFIRMATION_CODE_LENGTH) return false;
  for (const ch of body) if (!ALPHABET.includes(ch)) return false;
  return true;
}

// Shape check only — callers should also `isAddress()` the body via viem
// before trusting it. Telegram's start-parameter allowlist is [A-Za-z0-9_-]
// which means a literal 0x address fits cleanly.
export function isWatchPayload(candidate: string): boolean {
  if (!candidate.startsWith(WATCH_PAYLOAD_PREFIX)) return false;
  const body = candidate.slice(WATCH_PAYLOAD_PREFIX.length);
  if (body.length !== WATCH_PAYLOAD_ADDRESS_LENGTH) return false;
  if (!body.startsWith('0x')) return false;
  for (const ch of body.slice(2)) {
    if (!/[0-9a-fA-F]/.test(ch)) return false;
  }
  return true;
}

export function parseWatchPayload(candidate: string): string | null {
  if (!isWatchPayload(candidate)) return null;
  return candidate.slice(WATCH_PAYLOAD_PREFIX.length).toLowerCase();
}
