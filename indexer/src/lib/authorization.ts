import type { Address } from 'viem';
import { recoverAuthorizationAddress } from 'viem/utils';

export interface RawAuthorization {
  chainId: number | bigint;
  address: Address;
  nonce: number | bigint;
  yParity?: number;
  v?: bigint;
  r: `0x${string}`;
  s: `0x${string}`;
}

/**
 * Recover the EOA that signed an EIP-7702 authorization tuple.
 * Normalizes between v/yParity and number/bigint forms that appear across
 * viem versions and raw JSON-RPC responses.
 */
export async function recoverAuthorizingEoa(auth: RawAuthorization): Promise<Address> {
  const yParity = auth.yParity ?? (auth.v === undefined ? undefined : Number(auth.v) & 1);
  if (yParity === undefined) {
    throw new Error('authorization is missing yParity and v');
  }

  return await recoverAuthorizationAddress({
    authorization: {
      chainId: Number(auth.chainId),
      address: auth.address,
      nonce: Number(auth.nonce),
      yParity,
      r: auth.r,
      s: auth.s,
    },
  });
}
