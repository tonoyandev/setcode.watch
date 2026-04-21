import { ponder } from 'ponder:registry';
import { delegationEvent, delegationState } from 'ponder:schema';
import { CHAIN_ID_MAINNET } from '@setcode/shared';
import type { Address, Hex } from 'viem';
import { type RawAuthorization, recoverAuthorizingEoa } from '../lib/authorization.js';
import { authorizationTargetToDelegation } from '../lib/delegation.js';

interface AuthorizationListItem {
  chainId: number | bigint | Hex;
  address: Address;
  nonce: number | bigint | Hex;
  yParity?: number;
  v?: bigint | number | Hex;
  r: Hex;
  s: Hex;
}

interface Eip7702Transaction {
  type: 'eip7702';
  hash: Hex;
  authorizationList?: AuthorizationListItem[];
}

function asEip7702(tx: unknown): Eip7702Transaction | null {
  if (typeof tx !== 'object' || tx === null) return null;
  const t = tx as { type?: unknown };
  if (t.type !== 'eip7702') return null;
  return tx as Eip7702Transaction;
}

function toBigInt(value: number | bigint | Hex): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(value);
  return BigInt(value);
}

ponder.on('DelegationScanner:block', async ({ event, context }) => {
  const blockNumber = event.block.number;

  // Ponder's stripped Block type does not carry authorizationList for EIP-7702
  // transactions. Re-fetch the block via viem so we have access to the full
  // typed tx bodies. TODO(verify): if a future Ponder version exposes auth
  // lists natively, drop this extra call.
  const full = await context.client.getBlock({
    blockNumber,
    includeTransactions: true,
  });

  for (const rawTx of full.transactions) {
    const tx = asEip7702(rawTx);
    if (!tx) continue;
    const authList = tx.authorizationList ?? [];
    for (let i = 0; i < authList.length; i++) {
      const auth = authList[i];
      if (!auth) continue;
      const signer = await recoverAuthorizingEoa({
        chainId: toBigInt(auth.chainId),
        address: auth.address,
        nonce: toBigInt(auth.nonce),
        ...(auth.yParity !== undefined ? { yParity: auth.yParity } : {}),
        ...(auth.v !== undefined ? { v: toBigInt(auth.v) } : {}),
        r: auth.r,
        s: auth.s,
      } satisfies RawAuthorization);

      const newTarget = authorizationTargetToDelegation(auth.address);

      const prev = await context.db.find(delegationState, {
        eoa: signer,
        chainId: CHAIN_ID_MAINNET,
      });
      const previousTarget = prev?.currentTarget ?? null;

      await context.db.insert(delegationEvent).values({
        id: `${tx.hash}-${i}`,
        eoa: signer,
        previousTarget,
        newTarget,
        chainId: CHAIN_ID_MAINNET,
        blockNumber,
        timestamp: event.block.timestamp,
        txHash: tx.hash,
      });

      await context.db
        .insert(delegationState)
        .values({
          eoa: signer,
          chainId: CHAIN_ID_MAINNET,
          currentTarget: newTarget,
          lastUpdated: event.block.timestamp,
        })
        .onConflictDoUpdate({
          currentTarget: newTarget,
          lastUpdated: event.block.timestamp,
        });
    }
  }
});
