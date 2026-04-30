// Send a real EIP-7702 setcode transaction against a local Anvil fork.
// Used to drive the full UI/indexer/dispatcher/bot flow with a
// cryptographically real authorization, without spending money or
// waiting on a real chain.
//
// Prerequisites:
//   - Anvil running on http://localhost:8545 with --chain-id 1
//   - infra/.env's ETH_RPC_URL pointing at that Anvil
//   - Indexer restarted against that RPC
//
// Run from repo root:
//   pnpm -w dlx tsx scripts/send-7702.ts
//   # or with overrides:
//   DELEGATE=0xdeadbeef... pnpm -w dlx tsx scripts/send-7702.ts

import { http, createPublicClient, createWalletClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mainnet } from 'viem/chains';

const ANVIL_RPC = process.env.ANVIL_RPC ?? 'http://localhost:8545';

// Anvil's first prefunded account. Maps to address
//   0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
// — the one you paste into the website's lookup field.
const PK =
  (process.env.PK as `0x${string}` | undefined) ??
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

// Any 40-hex address as the delegation target. The indexer just records
// the address — no need for the delegate to actually be deployed code.
// Default uses the well-known EIP-7702 reference Simple7702Account so
// outputs look natural in alerts.
const DELEGATE =
  (process.env.DELEGATE as `0x${string}` | undefined) ??
  '0x4Cd241E8d1510e30b2076397afc7508Ae59C66c9';

async function main() {
  const account = privateKeyToAccount(PK);
  const wallet = createWalletClient({
    account,
    chain: mainnet,
    transport: http(ANVIL_RPC),
  });
  const pub = createPublicClient({ chain: mainnet, transport: http(ANVIL_RPC) });

  console.log(`signer EOA : ${account.address}`);
  console.log(`delegate   : ${DELEGATE}`);
  console.log(`rpc        : ${ANVIL_RPC}`);
  const head = await pub.getBlockNumber();
  console.log(`anvil head : ${head}`);

  // Sign an authorization that says "EOA `account` delegates to DELEGATE
  // on this chain". `executor: 'self'` means the same EOA both signs
  // the auth and sends the carrier tx — viem auto-bumps the nonce by 1
  // for the auth (since the tx itself uses the current nonce).
  const auth = await wallet.signAuthorization({
    contractAddress: DELEGATE,
    executor: 'self',
  });

  // Self-call type-4 transaction carrying the authorization. Empty
  // calldata, zero value: we just want the setcode side-effect to land
  // on chain. Viem picks transaction type 'eip7702' automatically when
  // authorizationList is present.
  const hash = await wallet.sendTransaction({
    authorizationList: [auth],
    to: account.address,
    value: 0n,
  });
  console.log(`sent tx    : ${hash}`);

  const receipt = await pub.waitForTransactionReceipt({ hash });
  console.log(`mined block: ${receipt.blockNumber}`);

  // Confirm the EOA now has 7702 code (ef0100 || delegate). If this is
  // empty, something failed silently.
  const code = await pub.getCode({ address: account.address });
  console.log(`eoa code   : ${code}`);
  if (code?.toLowerCase().startsWith('0xef0100')) {
    console.log('✓ EOA is now 7702-delegated. Watch the indexer + bot.');
  } else {
    console.error('✗ EOA code did not get the 0xef0100 prefix — check anvil logs.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
