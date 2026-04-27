import { CHAIN_ID_MAINNET, isSupportedChainId } from '@setcode/shared';
import { customAlphabet } from 'nanoid';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
export const CONFIRMATION_CODE_LENGTH = 16;
export const CONFIRMATION_CODE_PREFIX = 'c_';

// Second start-payload family: a one-off "peek" into the classification of
// an EOA. Two accepted shapes (both within Telegram's 64-char start-payload
// limit, which only allows [A-Za-z0-9_-]):
//
//   w_<0x40-hex>                -- legacy / mainnet shorthand
//   w_<chainId>_<0x40-hex>      -- explicit chain
//
// We always normalise into (chainId, address). Backward compatibility for
// the legacy form lets older share links keep working through any rolling
// app deploy that splits across cache windows.
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

function isHexAddressBody(body: string): boolean {
  if (body.length !== WATCH_PAYLOAD_ADDRESS_LENGTH) return false;
  if (!body.startsWith('0x')) return false;
  for (const ch of body.slice(2)) {
    if (!/[0-9a-fA-F]/.test(ch)) return false;
  }
  return true;
}

export function isWatchPayload(candidate: string): boolean {
  return parseWatchPayload(candidate) !== null;
}

export interface WatchPayload {
  chainId: number;
  address: string;
}

export function parseWatchPayload(candidate: string): WatchPayload | null {
  if (!candidate.startsWith(WATCH_PAYLOAD_PREFIX)) return null;
  const body = candidate.slice(WATCH_PAYLOAD_PREFIX.length);

  // Legacy form: `w_<address>` — chainId defaults to mainnet.
  if (isHexAddressBody(body)) {
    return { chainId: CHAIN_ID_MAINNET, address: body.toLowerCase() };
  }

  // Explicit form: `w_<chainId>_<address>`.
  const sep = body.indexOf('_');
  if (sep <= 0) return null;
  const chainPart = body.slice(0, sep);
  const addressPart = body.slice(sep + 1);
  if (!/^\d+$/.test(chainPart)) return null;
  const chainId = Number(chainPart);
  if (!Number.isInteger(chainId) || chainId <= 0) return null;
  if (!isSupportedChainId(chainId)) return null;
  if (!isHexAddressBody(addressPart)) return null;
  return { chainId, address: addressPart.toLowerCase() };
}

// Inverse of parseWatchPayload — kept here so the app and tests share one
// definition of the deep-link format.
export function buildWatchPayload(chainId: number, address: string): string {
  return `${WATCH_PAYLOAD_PREFIX}${chainId}_${address.toLowerCase()}`;
}
