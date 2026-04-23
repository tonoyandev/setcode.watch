# Roadmap

What's beyond the 16-step MVP. None of this is committed; the list is
here so that design decisions made during MVP don't silently foreclose
the obvious next moves.

Sorted roughly by how much value each unlocks per unit of work, not by
ETA.

---

## Near-term (post-MVP, next quarter-ish)

### L2 support

Pectra on L2s lands chain by chain. The abstraction already exists —
`shared/src/chains.ts` is a lookup table keyed on `chainId`, and the
indexer's config factory takes a chain record — but only mainnet is
wired up today.

Unlocking an L2:

1. Add the chain to `shared/src/chains.ts`.
2. Add an RPC URL env var (`ETH_RPC_URL_<chain>`).
3. Add a Ponder network block to `indexer/ponder.config.ts`.
4. Deploy `SetCodeRegistry` on the target chain (optional — the static
   registry works without it).
5. Re-verify the ochre palette on the L2-specific explorer links in the
   UI.

No watcher changes. The dispatcher already filters by chain when
formatting messages.

### Prometheus metrics

Stubbed in step 16. Target metrics:

- `dispatcher_lag_seconds` — `now() - max(delegation_event.timestamp)`
  where dispatcher cursor is caught up.
- `dispatcher_send_total{result=success|retry|permanent_fail}` — counter.
- `dispatcher_tick_duration_seconds` — histogram.
- `indexer_lag_blocks` — chain tip minus last indexed block.
- `http_requests_total{route,status}` — Hono middleware counter.

Expose on the watcher at `/metrics`. Caddy already rejects it from the
public surface; scrape via the internal Docker network.

### Dependabot / Renovate

One of the two. Pin via `.github/dependabot.yml` on the main lockfile,
Foundry submodules, and GitHub Actions. Group minor+patch updates into
weekly PRs; major updates as separate PRs.

### CODEOWNERS for the registry

Pin `shared/src/registry.json` and `contracts/src/SetCodeRegistry.sol`
to a small reviewer set. Prevents drive-by merges to the most
security-sensitive files.

---

## Medium-term (6–12 months)

### Mempool awareness

Currently the service observes the canonical chain only. A malicious
authorization signed 5s ago and not yet mined is invisible to us.

Options:

- **Public mempool polling.** `eth_subscribe("newPendingTransactions")`
  on a reputable provider, decode type-4 bodies in-flight, emit a
  pre-inclusion "pending delegation" alert class.
- **Simulation.** For pending type-4 txs, run `eth_call` with a state
  override to see what the delegated code would execute. Expensive;
  only worth it for unknown targets.

Both are additive. The alert format grows a new state
(`pending | confirmed`) and the dispatcher gets a second cursor.

Trade-off: pending alerts have false-positive potential (the tx might
never land). The bot would need a matching "that pending tx was
dropped" follow-up.

### Reverse lookup

"Which EOAs currently delegate to target X?" is useful for researchers,
red teams, and the registry governance PRs that need to see how many
accounts would be affected by a re-classification.

The indexer already has the data (`delegation_state`). Adding a
`GET /targets/:address/delegators` endpoint to the watcher is a day's
work. The UI side is a new `/target/[addr]` page.

The risk is privacy — it exposes which EOAs adopted which smart-account
implementation. We expose this information per-address today via
`/check`; the question is whether aggregating it is a new risk. Our
current answer is no (all data is on-chain anyway) but this warrants a
written review in `THREAT_MODEL.md` before shipping.

### Anomaly signals (not scores)

Not "ML risk score, 0-100". Concrete, explainable signals surfaced
alongside the classification:

- Target's bytecode changed since last time we saw a delegation to it.
- Target was deployed <N blocks ago.
- Target has <N total delegations.
- Target's deployer is on a known-bad list.

Each signal is a separate column in the check response, with a
one-liner explaining why it matters. Users decide what to do; we
don't decide for them.

### Additional alert channels

Email (SMTP, via an OSS MTA or SES), Slack/Discord webhooks, generic
HTTP webhook. Adds a `channels` table keyed on chat/user and fans out
in parallel.

Telegram stays the primary channel; others are "mirror" by default.
The UX pattern is that subscribers already confirmed via Telegram can
attach a secondary channel from `/manage`. Unconfirmed channels are
rejected to prevent arbitrary webhook spam.

### Registry UI for classifiers

Today, classifying a target requires a contract call from a dev tool.
A small admin page served under `/admin` (token-gated, like `/manage`)
that lists candidate targets (unknown, high-delegation-count) with a
"classify" button that constructs the tx for a connected wallet. Keeps
the classifier key in the user's wallet; we never hold it.

---

## Long-term (12+ months, if ever)

### Historical delegation browser

A public, searchable history of every EIP-7702 delegation ever made on
a supported chain, with classifications at the time of delegation and
current. Useful for forensic work.

Storage grows with the chain; retention policy needs revisiting. Likely
ships with a separate read replica and a BigQuery / Dune export path
rather than inflating the primary Postgres.

### Multisig / contract-account monitoring

The MVP scope ("EOAs only") exists because 7702 delegation is an
EOA-specific concept. But smart-account users often hold funds in a
Safe whose signers are EOAs that themselves could be delegated. A
feature that watches all signers of a given Safe for delegation
changes is valuable for treasury operators.

Implementation: resolve signers of a Safe address via on-chain read,
subscribe to each, aggregate alerts by Safe.

### On-chain subscription-based delivery

Flip `DelegationCanary` from advisory to authoritative. The watcher
only delivers alerts to chats whose `channelHash` matches an
on-chain `Subscribed` event, and respects `Unsubscribed`.

Censorship-resistant at the cost of gas per (un)subscription. Opt-in
only — the Telegram-flow subscription remains primary.

### Browser extension

An extension that overlays classification badges on Etherscan,
Safe{Wallet}, and wallet connect prompts. The backend API is already
there; the work is all UI distribution.

### Smart-account module

Build a 7702 delegation-guard module that smart accounts can adopt:
delegation attempts against targets not in a user-configured allowlist
get reverted. We write the module and the allowlist UI; the account
signs the authorization.

This crosses a line — we'd be touching the signing path, not just
watching. Stays explicitly out of scope for as long as "watch only"
is the brand promise.

---

## Explicitly not on the roadmap

- **Custody of any kind.** Non-negotiable. The worst outcome for this
  project is a breach where funds move.
- **ML-scored "risk".** Opaque verdicts with no explanation. We ship
  signals, not scores.
- **Paid tiers gating classifications.** The registry is and stays
  public-good infrastructure.
- **Chains without EIP-7702 semantics.** The classification concept
  doesn't transfer.
- **Running our own RPC.** Always-on Ethereum infra is someone else's
  business; we pay for RPC and keep the service stateless w.r.t.
  chain data.

---

## How to propose additions

Open an issue labelled `roadmap`. Include:

1. What class of user benefits and how.
2. What invariant from `ARCHITECTURE.md` it touches.
3. What it costs to operate (ongoing, not one-time).
4. Whether it can ship as an opt-in or needs to be on by default.

Proposals that don't answer (4) tend to get rewritten until they do.
