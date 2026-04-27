import { ARBITRUM, BASE, type ChainConfig, MAINNET, OPTIMISM } from '@setcode/shared';
import { createConfig } from 'ponder';
import type { Address, Transport } from 'viem';
import { http, fallback } from 'viem';
import { DelegationCanaryAbi } from './src/abis/DelegationCanary.js';
import { SetCodeRegistryAbi } from './src/abis/SetCodeRegistry.js';
import {
  fallbackRpcUrlsFor,
  optionalAddress,
  requireRpcUrlFor,
  requireStartBlockFor,
  warn,
} from './src/lib/env.js';

// Build a viem Transport from the chain's primary RPC + any configured
// fallbacks. Ponder hands this to its block-fetching loop; the fallback
// transport rotates through endpoints on transient RPC errors so a
// single flaky provider doesn't stall the indexer.
function transportFor(chain: ChainConfig): Transport {
  const primary = http(requireRpcUrlFor(chain));
  const fallbackUrls = fallbackRpcUrlsFor(chain);
  if (fallbackUrls.length === 0) return primary;
  return fallback([primary, ...fallbackUrls.map((url) => http(url))]);
}

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

const mainnetStartBlock = requireStartBlockFor(MAINNET);
const optimismStartBlock = requireStartBlockFor(OPTIMISM);
const baseStartBlock = requireStartBlockFor(BASE);
const arbitrumStartBlock = requireStartBlockFor(ARBITRUM);

// The DelegationScanner block source is attached to all four chains so
// the same handler runs once per chain per block. The Canary/Registry
// contracts are mainnet-only because that's where they're deployed —
// classification metadata is shared across chains via the watcher's
// classifier service, not duplicated on each L2.
export default createConfig({
  chains: {
    mainnet: {
      id: MAINNET.id,
      rpc: transportFor(MAINNET),
    },
    optimism: {
      id: OPTIMISM.id,
      rpc: transportFor(OPTIMISM),
    },
    base: {
      id: BASE.id,
      rpc: transportFor(BASE),
    },
    arbitrum: {
      id: ARBITRUM.id,
      rpc: transportFor(ARBITRUM),
    },
  },
  contracts: {
    DelegationCanary: {
      chain: 'mainnet',
      abi: DelegationCanaryAbi,
      address: canaryAddress,
      startBlock: mainnetStartBlock,
    },
    SetCodeRegistry: {
      chain: 'mainnet',
      abi: SetCodeRegistryAbi,
      address: registryAddress,
      startBlock: mainnetStartBlock,
    },
  },
  blocks: {
    DelegationScanner: {
      chain: {
        mainnet: { startBlock: mainnetStartBlock },
        optimism: { startBlock: optimismStartBlock },
        base: { startBlock: baseStartBlock },
        arbitrum: { startBlock: arbitrumStartBlock },
      },
      interval: 1,
    },
  },
});
