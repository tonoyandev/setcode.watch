import type { Address } from 'viem';
import { isAddress } from 'viem';

const MIN_START_BLOCK = 22_000_000;

export function requireStartBlock(): number {
  const raw = process.env.PONDER_START_BLOCK;
  if (!raw) {
    throw new Error(
      [
        'PONDER_START_BLOCK is required but not set.',
        '',
        'For Ethereum mainnet use the Pectra activation block.',
        'Verify the exact value before setting, for example via:',
        '  https://etherscan.io/block/22431084',
        '',
        'Set it in your .env file: PONDER_START_BLOCK=22431084',
      ].join('\n'),
    );
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < MIN_START_BLOCK) {
    throw new Error(
      `PONDER_START_BLOCK=${raw} is invalid. Must be an integer >= ${MIN_START_BLOCK} (Pectra era).`,
    );
  }
  return n;
}

export function requireRpcUrl(): string {
  const url = process.env.ETH_RPC_URL;
  if (!url) {
    throw new Error('ETH_RPC_URL is required but not set.');
  }
  return url;
}

export function optionalAddress(envKey: string): Address | undefined {
  const raw = process.env[envKey];
  if (!raw || raw.trim() === '') return undefined;
  if (!isAddress(raw)) {
    throw new Error(`${envKey}=${raw} is not a valid EVM address.`);
  }
  return raw as Address;
}

export function warn(source: string, message: string): void {
  console.warn(`[setcode/indexer] ${source}: ${message}`);
}
