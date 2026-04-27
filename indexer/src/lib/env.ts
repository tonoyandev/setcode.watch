import type { ChainConfig } from '@setcode/shared';
import type { Address } from 'viem';
import { isAddress } from 'viem';

// Floor used to defend against accidentally indexing the entire chain
// history. Pectra activated at ~22.4M on Ethereum; the L2 equivalents
// landed at much higher block numbers, so a single floor of 1 is the
// only value that's safe across all monitored chains. We delegate the
// actual "did you set this sensibly?" judgment to the operator —
// startBlock comes from infra/.env per chain.
const MIN_START_BLOCK = 1;

export function requireStartBlockFor(chain: ChainConfig): number {
  const raw = process.env[chain.startBlockEnvKey];
  if (!raw) {
    throw new Error(
      [
        `${chain.startBlockEnvKey} is required but not set.`,
        '',
        `Set the ${chain.name} start block to the Pectra-equivalent activation`,
        'block (or later) so the indexer skips pre-EIP-7702 history. Example:',
        `  ${chain.startBlockEnvKey}=22431084`,
      ].join('\n'),
    );
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < MIN_START_BLOCK) {
    throw new Error(
      `${chain.startBlockEnvKey}=${raw} is invalid. Must be an integer >= ${MIN_START_BLOCK}.`,
    );
  }
  return n;
}

export function requireRpcUrlFor(chain: ChainConfig): string {
  const url = process.env[chain.rpcEnvKey];
  if (!url) {
    throw new Error(`${chain.rpcEnvKey} is required but not set (RPC URL for ${chain.name}).`);
  }
  return url;
}

// Optional fallback RPC endpoints — Ponder handles transport-level
// failover when given a list. We silently drop unset entries so each
// chain can be configured with 0–N fallbacks independently.
export function fallbackRpcUrlsFor(chain: ChainConfig): string[] {
  const urls: string[] = [];
  for (const key of chain.fallbackRpcEnvKeys) {
    const url = process.env[key];
    if (url && url.trim() !== '') urls.push(url);
  }
  return urls;
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
