# Governance — the SetCode registry

This document describes who can add, change, and remove entries in the
classification registries that drive `verified | unknown | malicious` on
the UI and in Telegram alerts.

Two registries exist, with different governance surfaces:

1. **Static registry** — `shared/src/registry.json`, a JSON file reviewed
   via pull request.
2. **On-chain registry** — `SetCodeRegistry.sol`, role-gated contract
   writable only by `CLASSIFIER_ROLE`.

The watcher consults them in that precedence, **on-chain first**, then
static, then falls back to `unknown`. A malicious verdict on-chain is
always authoritative — the static file cannot whitewash it.

---

## Static registry

File: [`shared/src/registry.json`](../shared/src/registry.json). Validated
at import time by [`shared/src/registry.ts`](../shared/src/registry.ts)
against a Zod schema.

### Entry shape

Two variants, discriminated by `placeholder`:

```json
{ "placeholder": true,  "name": "...", "website": "...", "notes": "TODO(verify): ..." }
{ "placeholder": false, "address": "0x…", "name": "...", "classification": "verified",
  "addedAt": "2025-11-01T00:00:00Z", "website": "...", "notes": "..." }
```

- `placeholder: true` is a **stub**. It documents a known smart-account
  project that plausibly ships a 7702 delegation target but whose address
  has not been confirmed against a primary source. Placeholders never
  classify anything at runtime.
- `placeholder: false` is **live**. It maps a mainnet address to one of
  `verified | unknown | malicious`.

### Who can propose entries

Anyone. Open a PR that edits `shared/src/registry.json`.

### Who can merge entries

Anyone with write access to the repository, subject to the **evidence
rules** below. In practice the repo owner reviews every registry PR
during pre-MVP; post-MVP we expect to add a `CODEOWNERS` entry pinning
`shared/src/registry.json` to a small reviewer set.

### Evidence rules

Before a placeholder can be promoted to `placeholder: false`, the PR
must include a link to **at least one primary source** that ties the
given address to the project:

- An official release announcement from the project (blog post, GitHub
  release, X/Twitter post from a verified project handle).
- A contract address in the project's public contracts repo, cross-
  referenced on Etherscan with a matching deploy tx from a known
  deployer.
- A signed message from an address the project already controls, posted
  to a public channel the project owns.

Screenshots alone are not evidence. Community forum posts alone are not
evidence. If the reviewer cannot reach the primary source from a link in
the PR body within two clicks, the PR bounces.

Every `placeholder: false` entry is assumed `verified` unless the PR
body explains otherwise. Listing something as `malicious` in the static
file should be rare — on-chain is the faster, more revocable surface.

### Adding a new entry (checklist)

1. Does the project already have a placeholder? Replace it in-place —
   do not add a second row.
2. Is the address deployed on mainnet? Run
   `cast code <addr> --rpc-url $ETH_RPC_URL | head -c 40` — the first
   bytes should not be `0x` alone.
3. Is the classification `verified`? Include the primary-source link in
   the PR body under a `**Evidence:**` heading.
4. Is `addedAt` an ISO-8601 UTC timestamp for **today**? The watcher
   sorts registry views newest-first.
5. Does `pnpm --filter @setcode/shared test` pass? The Zod schema
   rejects duplicates, bad addresses, unparseable timestamps.

### Removing or downgrading a static entry

- Typos and metadata fixes (`name`, `website`, `notes`): normal PR.
- Demoting `verified` → `unknown`: PR with a one-line justification in
  the commit body.
- Promoting anything to `malicious`: **prefer the on-chain registry**.
  The static file's malicious slot exists only for targets where an
  on-chain entry is impossible (e.g. the project is offline and nobody
  holds `CLASSIFIER_ROLE` yet).
- Deleting a `placeholder: false` entry entirely: avoid. Flip it back
  to a placeholder with a note explaining why it was removed. Deletion
  breaks historical audits.

---

## On-chain registry

Contract: [`contracts/src/SetCodeRegistry.sol`](../contracts/src/SetCodeRegistry.sol).

Two roles, both defined with OpenZeppelin `AccessControl`:

- `CLASSIFIER_ROLE` — can call `classify(target, class, reason)`. Reason
  is a free-form string emitted in the `Classified` event; indexer
  stores it verbatim for display.
- `DEFAULT_ADMIN_ROLE` — can grant / revoke `CLASSIFIER_ROLE`, and is
  the **only** role that can call `downgradeMalicious(...)`. Emits a
  separate `MaliciousDowngraded` event so the indexer (and any UI) can
  distinguish a policy reversal from a normal classification update.

### Why malicious is sticky

Classifiers can forward-move any entry (`Unknown → Verified`,
`Unknown → Malicious`, `Verified → Malicious`) but **not** reverse-move
out of `Malicious`. This is enforced in Solidity — `classify()` reverts
with `CannotDowngradeMalicious` if the current state is malicious.

Rationale: a compromised classifier key is a more likely attack than a
compromised admin key. If sticking `Malicious` were reversible by the
classifier role, a key-compromise would let an attacker silently launder
a drainer back to verified. The two-role split means rolling back a
malicious verdict needs both a separate admin key **and** an on-chain
transaction that the UI specifically surfaces.

### Operating the admin key

Pre-MVP the admin is a single EOA held by the project owner. Between
steps 15 and 16 the admin will be moved to a 2-of-3 Safe whose signers
are documented here. The target state:

- Admin: Safe at `0x…` (3 signers, 2 required; signers listed in
  `docs/OPERATIONS.md` under "Administrative contacts" once rotated).
- Classifier: separate hot EOA, rotatable without touching the admin.

Downgrade events are rare and visible. Every `MaliciousDowngraded`
emission should be accompanied by a public write-up in
`docs/incidents/` explaining why.

### Adding a classifier

```solidity
// From the admin account, in a Foundry script or cast send:
registry.grantRole(registry.CLASSIFIER_ROLE(), 0x<new_classifier>);
```

Removing is symmetrical with `revokeRole`. Both actions emit
`RoleGranted` / `RoleRevoked` events that the indexer ingests.

### Emergency procedure

If the classifier key is suspected compromised:

1. Admin revokes `CLASSIFIER_ROLE` from the compromised EOA.
2. Admin grants `CLASSIFIER_ROLE` to a new fresh EOA.
3. Audit recent `Classified` events. Any verdict emitted by the
   compromised key between compromise and revocation must be reviewed
   manually and, if wrong, re-classified from the new key (or, for
   malicious-stuck rows, downgraded via `downgradeMalicious`).
4. File an incident note in `docs/incidents/`.

The watcher does not currently alert on registry events. That wiring
lands with step 16.

---

## Relationship to alert delivery

Governance of the registry does not grant anyone the ability to read
subscriber identities, force alerts to a chat, or unsubscribe a user.
Those flows live entirely in the watcher's own Telegram confirmation
path and are gated by one-time codes the classifier never sees.

The registry controls **what we call a target**. It does not control
**who hears about it**.
