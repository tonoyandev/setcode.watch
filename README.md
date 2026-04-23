# SetCode.watch

Monitoring and alerting for [EIP-7702](https://eips.ethereum.org/EIPS/eip-7702) delegated Ethereum accounts. Non-commercial, open source, MIT.

Since Pectra, any EOA can point its code at a contract with a single signed authorization. The target can be benign (smart-account UX), unknown (experimental), or malicious (drainer). SetCode.watch tells the owner which one, as it happens, before damage spreads.

---

## What it does

1. **Indexes** every EIP-7702 delegation on Ethereum mainnet.
2. **Classifies** each delegation target against an on-chain registry and a static allow-list.
3. **Alerts** subscribers over Telegram when their wallet gets (re)delegated, with a headline reflecting the classification: `verified`, `unknown`, or `malicious`.
4. **Exposes** a small web UI for looking up an address, subscribing, and managing subscriptions.

No custody, no private keys, no transaction signing. The service only watches.

---

## Status

**Pre-MVP, mid-build.** 15 of 16 bootstrap steps complete; step 15 (docs) just shipped.

| Step | Area | State |
| ---- | ---- | ----- |
| 1 | Monorepo + tooling (biome, commitlint, husky) | done |
| 2 | `@setcode/shared` — types, constants, chains, registry | done |
| 3 | `SetCodeRegistry` contract | done |
| 4 | `DelegationCanary` contract | done |
| 5 | `@setcode/indexer` — Ponder indexer | done |
| 6 | Watcher DB schema + migrations | done |
| 7 | Watcher Telegram bot + HTTP API + confirmation flow | done |
| 8 | Watcher alert dispatcher + retention sweep | done |
| 9 | Nuxt web app scaffold + primitives + landing page | done |
| 10 | `/check` flow — lookup + classification card | done |
| 11 | `/subscribe` flow — EOA → Telegram binding UI | done |
| 12 | `/manage` flow — token-gated subscription manager | **done** |
| 13 | Registry browser | **done** |
| 14 | `docker-compose` + Caddy for self-host | done |
| 15 | Docs (governance, threat model, operator runbook) | **done** |
| 16 | CI workflows + Prometheus metrics | pending |

Test counts at HEAD: **104 passing** (78 watcher + 0 indexer unit* + 26 app).
*Indexer has unit tests for the delegation-designator parser; mainnet-fork tests land later.

---

## Repo layout

pnpm workspace; one package per domain.

```
setcode.watch/
├── shared/       @setcode/shared    — types, constants, chains, static registry
├── contracts/    @setcode/contracts — Foundry, Solidity 0.8.28
├── indexer/      @setcode/indexer   — Ponder 0.16.x, reads EIP-7702 txs
├── watcher/      @setcode/watcher   — Telegraf bot, Hono HTTP API, dispatcher
├── app/          @setcode/app       — Nuxt 3 SSR web app
└── pnpm-workspace.yaml
```

Each package ships its own `README.md` with detailed notes. This file is the entry point.

---

## Architecture

```
                    Ethereum mainnet
                           │
                           ▼
                ┌────────────────────┐
                │   @setcode/indexer │  Ponder, reads type-4 txs + registry events
                │   (Postgres)       │  writes: delegation_event,
                └────────┬───────────┘          registry_classification_state
                         │
                         │ read-only views
                         ▼
                ┌────────────────────┐            ┌──────────────────┐
                │   @setcode/watcher │───────────▶│  Telegram API    │
                │   (Postgres,       │            └──────────────────┘
                │    same instance)  │
                │                    │◀────── HTTP ────────┐
                └────────────────────┘                     │
                                                           │
                                                 ┌─────────┴────────┐
                                                 │   @setcode/app   │
                                                 │   (Nuxt 3 SSR)   │
                                                 └──────────────────┘
                                                           ▲
                                                           │ browser
                                                           │
                                                        end user
```

Key invariants:

- **Postgres only.** Dev, CI, and prod all run real Postgres (prod) or `@electric-sql/pglite` (unit tests — real Postgres compiled to WASM, same regex CHECK constraints). No SQLite dialect drift.
- **Indexer is append-only.** Watcher reads from the indexer's tables; the two processes are independent and can be scaled separately.
- **Dispatcher is at-least-once.** A singleton cursor row (`dispatcher_cursor`, id=1) tracks the last fanned-out event. Idempotency is enforced by `alerts_sent UNIQUE(tx_hash, telegram_chat_id)`, so retries after transient failures cannot duplicate alerts.
- **Classification precedence.** On-chain `SetCodeRegistry` state beats the static shared registry beats `unknown`. Downgrading a target from verified to malicious does not require a package release.
- **No custody.** The service never holds keys, signs transactions, or takes funds. The worst abuse vector is spamming alerts, which the per-chat soft cap and the 5-minute confirmation TTL mitigate.

---

## Tech stack

| Layer | Choice | Why |
| ----- | ------ | --- |
| Language | TypeScript (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`) | One language across the stack; strictness catches real bugs early. |
| Package manager | pnpm 9 workspaces | Fast installs, reliable hoisting, first-class monorepo story. |
| Smart contracts | Solidity 0.8.28, Foundry | Fuzz + invariants built in, gas snapshot in CI. |
| Indexer | Ponder 0.16.x, viem | Block-scanner pattern; viem decodes authorization lists Ponder's typed tx does not yet expose. |
| Database | Postgres (prod), pglite (tests), Drizzle ORM + drizzle-kit | Single dialect everywhere. |
| Bot | Telegraf (long polling) | No inbound webhook surface to expose. |
| HTTP API | Hono + @hono/node-server | Tiny, Node-native, trivially testable via `app.request()`. |
| Web app | Nuxt 3.21, Vue 3.5, raw CSS with custom properties | SSR out of the box, no Tailwind / UI kit lock-in, warm minimal aesthetic. |
| Icons | lucide-vue-next | Tree-shakeable, neutral outline style. |
| Testing | vitest, @vue/test-utils, happy-dom | One runner across all packages. |
| Lint / format | Biome | One binary covers lint + format + import ordering. |
| Commit policy | Conventional Commits (commitlint + husky) | Enables automated changelog later. |

---

## MVP scope

Aggressively narrow on purpose. What counts as "MVP complete":

- Mainnet only. No L2 support. Chain abstraction exists but only mainnet is wired up.
- Telegram only. No email / SMS / webhook channels.
- English UI only. All strings route through `t(key, vars)` so a future i18n layer plugs in behind the helper with zero caller changes.
- Monitored wallets: EOAs only. Contract-account multisigs are out of scope.
- Classification outputs: exactly `verified | unknown | malicious`. No score / confidence interval.
- Retention: alerts persisted ~90 days (env-tunable), registry history persisted indefinitely on-chain.
- Self-host first: `docker-compose up` yields a working instance. Hosted demo comes after step 16.

Explicitly **out** of MVP:

- Private-mempool detection or simulation of pending type-4 txs.
- Reverse lookup ("which EOAs delegate to target X?") beyond the registry browser.
- In-wallet signing flows, any kind of custody.
- Anomaly scoring, ML classification, reputation graphs.
- Multi-chain. Pectra is mainnet-only today; other chains get added when they activate EIP-7702.

---

## Design principles

These show up as review comments if ignored, so they are called out here:

1. **No fabricated addresses or blocks.** Placeholder values are marked `TODO(verify)` and cannot ship verified. Real values get sourced from the provider's release notes or Etherscan and confirmed in code review.
2. **Typed error enums, not regex over strings.** Both the watcher HTTP API and the app's `useWatcherApi` composable return discriminated unions (`{ kind: 'invalid_eoa' }`, etc.).
3. **Pure functions testable without a runtime.** Anything with logic (`mapError`, classification, message formatting, cursor advance) is a pure function exercised without booting a bot, Nuxt app, or HTTP server.
4. **Flat i18n keys.** `classification.verified`, `landing.hero.headline`. No nesting that forces string splits at the call site.
5. **Warm minimal aesthetic.** Paper-cream (`#faf7f2`) background, ochre brand (`#a85a1c`), deep ink text. Inter for body, JetBrains Mono for addresses. No em-dashes, no AI marketing clichés, no stock gradient hero.
6. **Push after every major update.** Pre-MVP policy: a commit that advances the step counter gets pushed to `main` the same session.

---

## Getting started

Requirements:

- Node.js `>=22.11.0`
- pnpm `>=9.15.0`
- Postgres `>=15` (for watcher + indexer; tests use pglite and don't need it)
- Foundry (for contracts work)

```bash
git clone --recursive https://github.com/…/setcode.watch.git
cd setcode.watch
pnpm install

# per-package work
pnpm --filter @setcode/shared test
pnpm --filter @setcode/contracts test
pnpm --filter @setcode/indexer dev
pnpm --filter @setcode/watcher dev
pnpm --filter @setcode/app dev

# whole-repo
pnpm typecheck     # tsc across every package
pnpm test          # vitest across every package
pnpm lint          # biome check
pnpm lint:fix      # biome check --write
```

Environment variables are documented per-package in `*/.env.example` files. None of them are checked into git.

For self-hosting the whole stack (Postgres + indexer + watcher + app + Caddy in one `docker compose up`), see [`docs/OPERATIONS.md`](./docs/OPERATIONS.md) and [`infra/.env.example`](./infra/.env.example).

---

## Directory deep-dive

### `shared/`

Types and constants consumed by every other package. The static registry lives here. Registry governance (who can add entries, verification criteria) will land in `docs/GOVERNANCE.md` when docs are written in step 15.

### `contracts/`

- `SetCodeRegistry` — role-gated classification registry. `CLASSIFIER_ROLE` writes; `DEFAULT_ADMIN_ROLE` is the only path out of `Malicious` and emits a distinct event so UIs can treat it as an explicit policy reversal.
- `DelegationCanary` — optional advisory-signal contract for users to opt into on-chain subscription state (separate from the Telegram flow).
- Foundry submodules (`forge-std`, `openzeppelin-contracts@v5.1.0`) pinned under `lib/`. Clone with `--recursive` or run `git submodule update --init`.
- `.gas-snapshot` committed. CI enforces ≤ 2% drift.

### `indexer/`

Ponder 0.16.x. Indexes:

- Type-4 transactions from mainnet, via a block-scanner that reads `authorizationList` through viem because Ponder's typed `Transaction` doesn't expose it yet (as of 0.16.6).
- `DelegationCanary` events → `on_chain_subscription*` tables.
- `SetCodeRegistry` events → `registry_classification*` tables.

Contract addresses are optional: if unset, the indexer logs a warning and skips the relevant handler, and the dashboard falls back to off-chain data.

Cost note: the block handler does one extra `eth_getBlockByNumber` per block (~7200/day for mainnet). Use a provider without per-method pricing, or add Ponder's Postgres-backed block cache.

### `watcher/`

Runs three in-process subsystems sharing one Postgres instance:

- **Telegram bot** (Telegraf, long polling) — commands `/start c_<code>`, `/help`, `/list`, `/remove <addr>`, `/manage`.
- **HTTP API** (Hono) — `GET /health`, `POST /confirmations`, `POST /check`, `GET /manage/:token`, `POST /manage/:token/remove`, `GET /registry`.
- **Alert dispatcher** — ~5s poll loop (±10% jitter) that reads the indexer's `delegation_event` table, classifies, fans out to Telegram, advances a singleton cursor. Transient failures halt and retry; permanent failures (`403`, `chat not found`) log and advance.

Retention sweep runs hourly in the same loop and deletes `alerts_sent` rows older than `ALERT_RETENTION_DAYS` in bounded batches.

Five tables: `subscriptions`, `pending_confirmations`, `alerts_sent`, `manage_tokens`, `dispatcher_cursor`. See `watcher/README.md` for the full schema reference.

### `app/`

Nuxt 3.21 SSR app. Shipped through step 13:

- Design tokens (`assets/css/tokens.css`) — warm minimal palette, spacing scale, type scale, iconography sizes (`--icon-inline: 14px`, `--icon-card: 20px`, `--icon-hero: 32px`).
- Reset + baseline (`reset.css`, `base.css`).
- Primitives with `G` prefix: `GButton`, `GInput`, `GCard`, `GBadge`, `GAddress`, `GCodeBlock`.
  - Under `exactOptionalPropertyTypes: true` the primitives spread optional attributes via `v-bind="attrs"` so undefined values are omitted from the DOM rather than bound literally.
- `useWatcherApi` composable wrapping `$fetch`, with an exported pure `mapError(err)` that translates watcher error codes to `WatcherApiError`, a typed discriminated union. Covers `/confirmations`, `/check`, both `/manage/:token` endpoints, and `/registry`.
- EN-only i18n (`i18n/en.ts`, `i18n/index.ts`) — flat keys, `t(key, vars)`, shape-compatible with a future i18n library.
- Pages:
  - `pages/index.vue` — landing (hero + how + why).
  - `pages/check.vue` — input → `POST /check`, renders classification card with `GBadge` + `GAddress`, surfaces classification source (registry / static / unknown), CTA links to subscribe.
  - `pages/subscribe.vue` — input → `POST /confirmations`, pre-fills from `?eoa=…`, renders Telegram deep-link CTA with live countdown to `expiresAt`, copy-code fallback.
  - `pages/manage/[token].vue` — lists the chat's confirmed EOAs via `GET /manage/:token` and removes them via `POST /manage/:token/remove`, with per-row remove state and revoked-token recovery.
  - `pages/registry.vue` — registry browser with class filter, newest-first sort, and pagination backed by watcher `GET /registry`.
- Sticky header + footer layout with monospace brand mark.

26 tests across 6 files (component primitives + composable + i18n), running on happy-dom.

---

## Docs

Full docs live in [`docs/`](./docs/):

- [`ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — process topology, data flow, invariants.
- [`GOVERNANCE.md`](./docs/GOVERNANCE.md) — static + on-chain registry governance, evidence rules, emergency procedure.
- [`THREAT_MODEL.md`](./docs/THREAT_MODEL.md) — attacker classes, mitigations, explicit non-goals.
- [`OPERATIONS.md`](./docs/OPERATIONS.md) — self-host runbook: first boot, logs, backups, rotation, troubleshooting.
- [`ROADMAP.md`](./docs/ROADMAP.md) — what's beyond MVP (L2, mempool awareness, reverse lookup, anomaly signals).

## Roadmap (step 16)

### Step 16 — CI + observability

- GitHub Actions: lint, typecheck, test, gas-snapshot-check on every PR.
- Prometheus metrics from the watcher: dispatcher lag, send successes, send failures by class, per-tick duration.
- Healthcheck endpoints already exist; wire them into compose healthchecks.

---

## Contributing

This is a pre-MVP codebase. The step-by-step bootstrap is the primary reviewer of architectural decisions; expect every change to fit into that sequence. Drive-by refactors that cross step boundaries will usually be asked to wait.

Rules:

- Conventional Commits (enforced by commitlint).
- No em-dashes in user-facing strings. No AI marketing clichés (no "seamlessly", "revolutionary", "powerful").
- Strict TypeScript. No `any` without a comment explaining why.
- No fabricated mainnet data. `TODO(verify)` markers for any placeholder that needs confirming against a primary source.
- Postgres, not SQLite, in every environment.

---

## License

MIT. See [`LICENSE`](./LICENSE).
