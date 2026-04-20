import { CHAIN_ID_MAINNET } from './constants.js';

export interface ChainConfig {
  id: number;
  name: string;
  shortName: string;
  rpcEnvKey: string;
  fallbackRpcEnvKeys: readonly string[];
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
  explorerUrl: 'https://etherscan.io',
  explorerTxPath: (hash) => `https://etherscan.io/tx/${hash}`,
  explorerAddressPath: (address) => `https://etherscan.io/address/${address}`,
};

export const SUPPORTED_CHAINS: readonly ChainConfig[] = [MAINNET];

export function getChainById(id: number): ChainConfig | undefined {
  return SUPPORTED_CHAINS.find((c) => c.id === id);
}
