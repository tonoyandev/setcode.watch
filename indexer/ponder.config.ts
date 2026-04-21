import { createConfig } from 'ponder';
import type { Address } from 'viem';
import { http } from 'viem';
import { DelegationCanaryAbi } from './src/abis/DelegationCanary.js';
import { SetCodeRegistryAbi } from './src/abis/SetCodeRegistry.js';
import { optionalAddress, requireRpcUrl, requireStartBlock, warn } from './src/lib/env.js';

const startBlock = requireStartBlock();
const rpcUrl = requireRpcUrl();

const DISABLED_ADDRESS = '0x000000000000000000000000000000000000dEaD' as Address;

const resolvedCanary = optionalAddress('DELEGATION_CANARY_ADDRESS');
if (!resolvedCanary) {
  warn('DelegationCanary', 'address unset — on-chain subscription tracking disabled');
}
const canaryAddress = resolvedCanary ?? DISABLED_ADDRESS;

const resolvedRegistry = optionalAddress('SETCODE_REGISTRY_ADDRESS');
if (!resolvedRegistry) {
  warn('SetCodeRegistry', 'address unset — on-chain classification tracking disabled');
}
const registryAddress = resolvedRegistry ?? DISABLED_ADDRESS;

export default createConfig({
  chains: {
    mainnet: {
      id: 1,
      rpc: http(rpcUrl),
    },
  },
  contracts: {
    DelegationCanary: {
      chain: 'mainnet',
      abi: DelegationCanaryAbi,
      address: canaryAddress,
      startBlock,
    },
    SetCodeRegistry: {
      chain: 'mainnet',
      abi: SetCodeRegistryAbi,
      address: registryAddress,
      startBlock,
    },
  },
  blocks: {
    DelegationScanner: {
      chain: 'mainnet',
      startBlock,
      interval: 1,
    },
  },
});
