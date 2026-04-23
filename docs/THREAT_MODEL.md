# Threat model

Scope: the SetCode.watch service as deployed from this repo —
indexer + watcher + Nuxt app + on-chain registry + Telegram bot. Out of
scope: the Ethereum L1 itself, the user's wallet software, and
Telegram's own infrastructure.

The service watches and reports. It never signs, custodies, or moves
funds. Most of the threat model reduces to: "can an attacker make the
signal wrong, or silence it?"

---

## Assets

In rough order of value to an attacker:

1. **Classification integrity** — the ability to mark a malicious target
   as verified, or a verified target as malicious.
2. **Alert delivery** — the ability to suppress, redirect, or fabricate
   alerts to a given chat.
3. **Subscriber identity** — the mapping `EOA → telegramChatId`, held
   off-chain in Postgres.
4. **Service availability** — the indexer keeping up with chain tip and
   the watcher polling for new events.

There are no custody assets. The service cannot be drained because it
holds nothing.

---

## Trust assumptions

- The Ethereum L1 finalises correctly; mainnet reorgs deeper than
  Ponder's configured safe-depth are out of scope (the indexer replays
  on reorg).
- Telegram delivers messages reliably and does not impersonate users;
  Telegram chat IDs are not spoofable by third parties.
- The RPC provider does not lie about block data. Multi-provider fallback
  (`ETH_RPC_FALLBACK_*`) is a liveness measure, not an integrity one — a
  provider returning false data would need to be replaced.
- OpenZeppelin `AccessControl` v5.1.0 is correct.
- The admin key for `SetCodeRegistry` is held securely (see
  [`docs/GOVERNANCE.md`](./GOVERNANCE.md)).
- The operator does not run malicious code on the host. Anyone with root
  on the Docker host has full access to Postgres and the Telegram token.

---

## Attacker classes

### A1. Passive reader

Sees public GitHub, public on-chain data, public Telegram bot messages.
No credentials, no registered chats.

Capabilities:

- Query `POST /check` for any EOA → classification.
- Browse the public registry UI.
- Guess an EOA and check whether it is subscribed? **No.** The API
  surfaces classifications but does not reveal subscriber identity.
  `/manage/:token` requires a token minted to a specific chat.

### A2. Registered subscriber

Has confirmed at least one EOA to their Telegram chat.

Capabilities:

- Receive alerts for their confirmed EOAs.
- Call `/manage/:token` with the token the bot handed them; list and
  remove their own subscriptions.
- Attempt to bind arbitrary EOAs to their chat. This is the intended
  design — anyone can watch any EOA. The EOA's owner is not informed
  that someone is watching, but no read access to the EOA is granted.

### A3. Hostile subscriber (spammer)

A registered subscriber who binds many EOAs or triggers many
`/confirmations` requests.

Mitigations:

- Confirmation codes expire in 5 minutes and are consumed on use.
- Per-chat soft cap on confirmed subscriptions (documented in
  `watcher/README.md`; adjustable via env).
- Rate limit on `POST /confirmations` via the reverse proxy (Caddy
  handles this; the watcher itself does not rate-limit).
- `alerts_sent UNIQUE(tx_hash, chat_id)` prevents alert duplication
  even if the dispatcher retries.

### A4. Phishing operator

Runs a phishing kit that convinces victims to sign EIP-7702
authorizations pointing at a drainer contract.

This is the primary **external** threat the service is designed to
mitigate. The attacker's interaction with us is asymmetric: they write
to mainnet, we read mainnet. They cannot stop us reading. They can:

- Try to get their drainer listed as `verified` on the registry — see
  A6 below.
- Flood mainnet with noise type-4 txs to overwhelm our indexer — see
  L2 availability below.
- Race the alert — sign and drain inside a single block, before the
  user sees the push.

The service cannot prevent the race. It can only narrow it: backfill is
continuous, the dispatcher polls every ~5s, and there is no
human-in-the-loop for normal classification. 5–15 seconds from block
inclusion to Telegram push is the current target.

### A5. Compromised RPC provider

Returns false blocks or authorization lists to the indexer.

Detection: cross-check against fallback providers (not yet
implemented — tracked as an enhancement in `ROADMAP.md`). Pre-MVP the
operator picks a reputable provider and monitors indexer lag.

Impact: false classifications flow to subscribers. Once detected,
replaying from a trusted provider repopulates the tables correctly; the
indexer is deterministic on a given block range.

### A6. Compromised classifier key

The EOA holding `CLASSIFIER_ROLE` on `SetCodeRegistry` signs malicious
classifications.

Capabilities:

- Mark any target as `Verified`, `Unknown`, or `Malicious`.
- **Cannot** undo a `Malicious` state (see GOVERNANCE.md) — that path is
  admin-only and emits a distinct event.

Recovery: admin revokes the role, rotates it, audits every `Classified`
event in the window of compromise. See GOVERNANCE.md "Emergency
procedure".

### A7. Compromised admin key

The EOA holding `DEFAULT_ADMIN_ROLE`.

Capabilities:

- Grant `CLASSIFIER_ROLE` to any address; revoke it from any address.
- Downgrade `Malicious` entries to `Unknown` or `Verified`, emitting
  `MaliciousDowngraded`.

There is no recovery from this within the contract — OZ's
`AccessControl` does not support a two-step admin handoff out of the
box, and we deliberately do not expose admin rotation to classifiers.
Mitigation is procedural: move admin to a Safe (scheduled between steps
15 and 16) and monitor `MaliciousDowngraded` events.

### A8. Compromised host

Attacker gains root on the machine running the stack.

Capabilities:

- Read Postgres directly → full subscriber list (`EOA → chat_id`).
- Read `TELEGRAM_BOT_TOKEN` → impersonate the bot to any Telegram user
  until the token is revoked.
- Suppress alerts by stopping the dispatcher.
- Fabricate alerts to any chat the bot has a prior session with.

This is the highest-impact compromise. Mitigations are standard host
hygiene (firewall, no SSH password auth, Docker with least privilege,
secrets not in git) and fast token rotation via @BotFather.

The classifier key is **not** on the host. The host reads the on-chain
registry but never writes to it.

### A9. Malicious dependency

A supply-chain attack via npm (watcher, indexer, app) or via a Foundry
submodule.

Mitigations:

- pnpm lockfile checked into git; `pnpm install --frozen-lockfile` in
  CI and Docker builds.
- Biome replaces ESLint + Prettier, shrinking the dep tree.
- Foundry libs are submodules pinned to commits (`openzeppelin-contracts`
  at v5.1.0), not version ranges.
- No post-install scripts run during `pnpm install` — verified.
- Dependabot / Renovate for the main lockfile lands in step 16.

A compromised npm package in the watcher could exfiltrate Postgres
rows. There is currently no egress firewall; pre-MVP the mitigation is
that the attack surface is small and the deps are audited at PR time.

---

## Attacks and mitigations, by target

### T1. "Mark my drainer as verified"

Attack path: compromise classifier key, or submit a PR to
`shared/src/registry.json`.

Mitigations:

- Classifier key separation from admin key (contract-enforced).
- Static registry PR requires primary-source evidence
  (policy-enforced; see GOVERNANCE.md).
- On-chain verdict beats static — even if the PR slips through,
  a classifier can override.
- Every `Classified` event is public and indexed; out-of-band
  monitoring can detect anomalies.

Residual risk: a single compromised classifier key with the static PR
reviewer asleep can push a false-verified for as long as the window
before detection. **Accepted** pre-MVP; post-MVP the Safe admin +
multi-reviewer `CODEOWNERS` close this.

### T2. "Suppress the alert for victim X"

Attack path: compromise the host, compromise the RPC provider, DoS the
indexer, or convince the user to /remove their own subscription.

Mitigations:

- Indexer and watcher are separate processes; one wedged does not
  silence the other.
- `alerts_sent` is idempotent, so a crash-and-restart mid-dispatch
  does not drop the alert.
- The Telegram chat can be mirrored to a second channel; the service
  does not force a single endpoint.
- /remove requires interaction with the bot from the chat that confirmed
  the subscription. A third party cannot remove your subscription.

### T3. "Send fake alerts to chat X"

Attack path: compromise the Telegram bot token.

Mitigations:

- Token held in `infra/.env`, never in git, never in logs.
- Token rotation is a single @BotFather click + container restart.
- Bot messages include a one-liner tying the alert to a block + tx hash
  the user can verify on Etherscan. Fake alerts for nonexistent txs are
  caught the moment the user clicks the link.

### T4. "Enumerate subscribers"

Attack path: scrape the HTTP API or bot.

Mitigations:

- There is no public "is this EOA subscribed?" endpoint.
- `/manage/:token` requires a bearer token minted to a specific chat
  via `/manage` in the bot; the token has a short TTL and a revoke
  path.
- `/check` returns classification, not subscription state.

### T5. "Run out the indexer or watcher"

Attack path: spam type-4 transactions to blow up indexing cost, or spam
`/confirmations` requests.

Mitigations:

- Indexer is priced per block, not per tx — a tx flood does not
  multiply RPC costs.
- `/confirmations` is rate-limited at the reverse proxy; codes have a
  5-minute TTL.
- Retention sweep deletes old `alerts_sent` rows so the table doesn't
  grow unbounded.

---

## Explicit non-goals

The service does **not** defend against, and does not claim to defend
against:

- Wallet compromise where the user has already signed a malicious
  authorization. We can only alert; we cannot block the tx.
- MEV / front-running of delegation changes. We observe the canonical
  chain; we do not interpret the mempool.
- Attacks on the user's Telegram account (SIM swap, session hijack).
  An attacker in your Telegram account can read your alerts and
  unsubscribe you.
- Bugs in the delegated contract after classification. "Verified"
  means the target is a known implementation from a reputable project,
  not that the implementation is free of vulnerabilities.
- L2 delegations. Mainnet only in MVP.
- Private RPC or simulated pending txs. See ROADMAP.md for the
  mempool-detection track.

---

## Reporting a vulnerability

Open an issue labelled `security` or email the address in the GitHub
profile of the repo owner. We treat the following as security-reportable:

- Ability to classify without the classifier role.
- Ability to read another chat's subscription list.
- Ability to suppress alerts for an arbitrary chat.
- Ability to move funds or sign transactions using any service key
  (should never be possible — the service holds no signing keys, but
  please still report).

Non-security reports (bugs, performance, UI glitches) go in regular
GitHub issues.
