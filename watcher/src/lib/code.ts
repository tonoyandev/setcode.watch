import { customAlphabet } from 'nanoid';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
export const CONFIRMATION_CODE_LENGTH = 16;
export const CONFIRMATION_CODE_PREFIX = 'c_';

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
