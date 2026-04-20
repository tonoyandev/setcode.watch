# @setcode/shared

Shared TypeScript types, constants, and the delegation-target registry consumed by every SetCode.watch package.

## Contents

- `types` — `Classification`, `DelegationState`, `DelegationEvent`, `Subscription`, `AlertEvent`, `RegistryEntry`
- `constants` — EIP-7702 delegation designator prefix (`0xef0100`), code byte length, Pectra activation block (TODO)
- `chains` — `SUPPORTED_CHAINS`, explorer URL helpers (mainnet only in MVP)
- `registry` — validated read-only registry with `classify(address)` and `lookup(address)` helpers

## Usage

```ts
import { classify, SUPPORTED_CHAINS, DELEGATION_DESIGNATOR_PREFIX } from '@setcode/shared';
import type { DelegationEvent } from '@setcode/shared/types';
```

## Registry

The registry ships with placeholder entries for known-good delegation targets. Before any target can be returned as `verified`, its mainnet address must be confirmed against the provider's official release notes and the entry converted from a placeholder to a full verified record. No runtime fallbacks, no guesses.

Governance of the registry is documented in `docs/GOVERNANCE.md`.
