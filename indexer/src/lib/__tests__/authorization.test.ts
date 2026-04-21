import { generatePrivateKey, privateKeyToAccount, signAuthorization } from 'viem/accounts';
import { describe, expect, it } from 'vitest';
import { recoverAuthorizingEoa } from '../authorization.js';

describe('recoverAuthorizingEoa', () => {
  it('round-trips a signed authorization', async () => {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const auth = await signAuthorization({
      privateKey,
      chainId: 1,
      address: '0x0000000000000000000000000000000000000001',
      nonce: 7,
    });

    const recovered = await recoverAuthorizingEoa({
      chainId: auth.chainId,
      address: auth.address,
      nonce: auth.nonce,
      ...(auth.yParity !== undefined ? { yParity: auth.yParity } : {}),
      r: auth.r,
      s: auth.s,
    });

    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase());
  });

  it('derives yParity from v when yParity is missing', async () => {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const auth = await signAuthorization({
      privateKey,
      chainId: 1,
      address: '0x0000000000000000000000000000000000000002',
      nonce: 0,
    });

    const recovered = await recoverAuthorizingEoa({
      chainId: auth.chainId,
      address: auth.address,
      nonce: auth.nonce,
      v: BigInt(auth.yParity ?? 0),
      r: auth.r,
      s: auth.s,
    });

    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase());
  });
});
