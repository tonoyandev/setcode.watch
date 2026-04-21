import { DELEGATION_CODE_HEX_LENGTH, DELEGATION_DESIGNATOR_PREFIX } from '@setcode/shared';
import type { Address, Hex } from 'viem';
import { getAddress } from 'viem';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;

export function isDelegationDesignator(code: Hex | undefined | null): boolean {
  if (!code) return false;
  if (code.length !== DELEGATION_CODE_HEX_LENGTH) return false;
  return code.toLowerCase().startsWith(DELEGATION_DESIGNATOR_PREFIX);
}

export function decodeDelegationTarget(code: Hex | undefined | null): Address | null {
  if (!isDelegationDesignator(code)) return null;
  const rawTarget = `0x${(code as Hex).slice(DELEGATION_DESIGNATOR_PREFIX.length)}` as Hex;
  const checksummed = getAddress(rawTarget);
  return checksummed === ZERO_ADDRESS ? null : checksummed;
}

export function authorizationTargetToDelegation(contractAddress: Address): Address | null {
  const checksummed = getAddress(contractAddress);
  return checksummed === ZERO_ADDRESS ? null : checksummed;
}
