# @setcode/indexer

Ponder indexer for EIP-7702 delegations on Ethereum mainnet, plus the `DelegationCanary` and `SetCodeRegistry` contract events.

## What it indexes

| Source                                      | Tables                                                  | Required? |
| ------------------------------------------- | ------------------------------------------------------- | --------- |
| Type-4 transactions (EIP-7702)              | `delegation_event`, `delegation_state`                  | Always    |
| `DelegationCanary` contract events          | `on_chain_subscription`, `on_chain_subscription_state`  | Optional  |
| `SetCodeRegistry` contract events           | `registry_classification`, `registry_classification_state` | Optional  |

If `DELEGATION_CANARY_ADDRESS` or `SETCODE_REGISTRY_ADDRESS` are unset, the indexer prints a warning and skips the relevant handler. The dashboard falls back to off-chain data. Once the contracts are deployed, set the env vars and restart; Ponder will backfill from `PONDER_START_BLOCK`.

## Environment

See `.env.example` for the full list. Notable behavior:

- `PONDER_START_BLOCK` **unset → fail fast**. Must be an integer `>= 22_000_000` (Pectra era). Do not guess the exact Pectra activation block — verify against etherscan before setting.
- `ETH_RPC_URL` **required**.
- Contract addresses **optional** with graceful degradation.

## Cost note

The block-scanner handler fetches every block with full transactions via viem to read EIP-7702 authorization lists (Ponder's typed `Transaction` does not expose `authorizationList` as of 0.16.6). Expect roughly one extra `eth_getBlockByNumber` call per block. For mainnet that is on the order of 7200 calls/day. Use a provider that does not charge per-method, or add a Postgres-backed Ponder cache.

## Commands

```
pnpm --filter @setcode/indexer dev          # hot-reload dev mode
pnpm --filter @setcode/indexer start        # production
pnpm --filter @setcode/indexer codegen      # regenerate virtual modules
pnpm --filter @setcode/indexer typecheck
pnpm --filter @setcode/indexer test         # vitest (lib unit tests)
```

Dev server exposes a GraphQL endpoint on `:42069/graphql`.

## Tests

Unit tests cover the delegation-designator parser and the authorization signer-recovery helper, using viem's reference implementations for round-trip correctness. The block handler itself is not unit-tested; it will be exercised against a fork of mainnet in a follow-up (see `docs/ROADMAP.md`).
