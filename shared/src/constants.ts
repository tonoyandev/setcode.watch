import type { Hex } from 'viem';

export const DELEGATION_DESIGNATOR_PREFIX: Hex = '0xef0100';

export const DELEGATION_CODE_BYTE_LENGTH = 23;

export const CHAIN_ID_MAINNET = 1;
export const CHAIN_ID_OPTIMISM = 10;
export const CHAIN_ID_BASE = 8453;
export const CHAIN_ID_ARBITRUM = 42161;

export const PECTRA_MAINNET_BLOCK: bigint | null = null;

export const DELEGATION_CODE_HEX_LENGTH = 2 + DELEGATION_CODE_BYTE_LENGTH * 2;
