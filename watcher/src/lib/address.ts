import { type Address, isAddress } from 'viem';

// Normalises a user-supplied EOA into the lowercase `0x…` form stored by the
// schema. Returns null if the input is not a valid 20-byte address.
export function normaliseEoa(input: string): Address | null {
  const trimmed = input.trim();
  if (!isAddress(trimmed, { strict: false })) return null;
  return trimmed.toLowerCase() as Address;
}
