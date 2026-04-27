import {
  CHAIN_ID_ARBITRUM,
  CHAIN_ID_BASE,
  CHAIN_ID_MAINNET,
  CHAIN_ID_OPTIMISM,
} from './constants.js';

// Per-chain configuration shared across packages. The indexer consults
// `rpcEnvKey` / `fallbackRpcEnvKeys` to wire Ponder transports; the watcher
// uses `explorerTxPath` / `shortName` when rendering Telegram alerts;
// the app uses `id` / `name` purely as labels.
//
// To add a new monitored chain: extend SUPPORTED_CHAINS below + set the
// corresponding env vars in infra/.env. No other files should hardcode
// chain ids — always look them up via getChainById.
export interface ChainConfig {
  id: number;
  name: string;
  shortName: string;
  rpcEnvKey: string;
  fallbackRpcEnvKeys: readonly string[];
  // Per-chain start block env var — Pectra-equivalent activation block
  // is the natural floor (no EIP-7702 transactions can exist before it).
  // Operators can push it forward to skip dead history if they don't
  // care about pre-launch delegations.
  startBlockEnvKey: string;
  explorerUrl: string;
  explorerTxPath: (hash: string) => string;
  explorerAddressPath: (address: string) => string;
}

export const MAINNET: ChainConfig = {
  id: CHAIN_ID_MAINNET,
  name: 'Ethereum',
  shortName: 'eth',
  rpcEnvKey: 'ETH_RPC_URL',
  fallbackRpcEnvKeys: ['ETH_RPC_FALLBACK_1', 'ETH_RPC_FALLBACK_2'],
  startBlockEnvKey: 'ETH_START_BLOCK',
  explorerUrl: 'https://etherscan.io',
  explorerTxPath: (hash) => `https://etherscan.io/tx/${hash}`,
  explorerAddressPath: (address) => `https://etherscan.io/address/${address}`,
};

export const OPTIMISM: ChainConfig = {
  id: CHAIN_ID_OPTIMISM,
  name: 'Optimism',
  shortName: 'op',
  rpcEnvKey: 'OP_RPC_URL',
  fallbackRpcEnvKeys: ['OP_RPC_FALLBACK_1', 'OP_RPC_FALLBACK_2'],
  startBlockEnvKey: 'OP_START_BLOCK',
  explorerUrl: 'https://optimistic.etherscan.io',
  explorerTxPath: (hash) => `https://optimistic.etherscan.io/tx/${hash}`,
  explorerAddressPath: (address) => `https://optimistic.etherscan.io/address/${address}`,
};

export const BASE: ChainConfig = {
  id: CHAIN_ID_BASE,
  name: 'Base',
  shortName: 'base',
  rpcEnvKey: 'BASE_RPC_URL',
  fallbackRpcEnvKeys: ['BASE_RPC_FALLBACK_1', 'BASE_RPC_FALLBACK_2'],
  startBlockEnvKey: 'BASE_START_BLOCK',
  explorerUrl: 'https://basescan.org',
  explorerTxPath: (hash) => `https://basescan.org/tx/${hash}`,
  explorerAddressPath: (address) => `https://basescan.org/address/${address}`,
};

export const ARBITRUM: ChainConfig = {
  id: CHAIN_ID_ARBITRUM,
  name: 'Arbitrum One',
  shortName: 'arb1',
  rpcEnvKey: 'ARB_RPC_URL',
  fallbackRpcEnvKeys: ['ARB_RPC_FALLBACK_1', 'ARB_RPC_FALLBACK_2'],
  startBlockEnvKey: 'ARB_START_BLOCK',
  explorerUrl: 'https://arbiscan.io',
  explorerTxPath: (hash) => `https://arbiscan.io/tx/${hash}`,
  explorerAddressPath: (address) => `https://arbiscan.io/address/${address}`,
};

export const SUPPORTED_CHAINS: readonly ChainConfig[] = [MAINNET, OPTIMISM, BASE, ARBITRUM];

export const SUPPORTED_CHAIN_IDS: readonly number[] = SUPPORTED_CHAINS.map((c) => c.id);

export function getChainById(id: number): ChainConfig | undefined {
  return SUPPORTED_CHAINS.find((c) => c.id === id);
}

export function isSupportedChainId(id: number): boolean {
  return SUPPORTED_CHAIN_IDS.includes(id);
}
