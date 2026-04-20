# @setcode/contracts

Solidity contracts for SetCode.watch. Solc 0.8.28, Foundry-native.

## Contracts

### `SetCodeRegistry`

Governance-controlled registry of EIP-7702 delegation-target classifications (`Unknown`, `Verified`, `Malicious`).

- `CLASSIFIER_ROLE` can call `classify(target, classification, reason)`.
- `DEFAULT_ADMIN_ROLE` can call `downgradeMalicious(target, newClassification, reason)` — the only path out of `Malicious`, and it emits a distinct event so consumers can treat it as an explicit policy reversal.
- No storage of `reason` on-chain (event-only) to keep writes cheap.
- No upgradeability.

### `DelegationCanary` (step 4)

Not yet implemented.

## Usage

```
pnpm --filter @setcode/contracts build
pnpm --filter @setcode/contracts test
pnpm --filter @setcode/contracts snapshot
pnpm --filter @setcode/contracts snapshot:check
```

CI profile (10k fuzz runs, 1k×50 invariants):

```
FOUNDRY_PROFILE=ci forge test -vvv
```

## Submodules

`forge-std` and `openzeppelin-contracts@v5.1.0` are pinned git submodules under `lib/`. Clone the repo with `--recursive` or run `git submodule update --init`.

## Gas snapshot

`.gas-snapshot` is committed. CI enforces drift ≤ 2%. Regenerate with `forge snapshot` after any deliberate gas change, then commit.
