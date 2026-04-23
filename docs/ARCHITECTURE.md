# Architecture

Expanded version of the diagram in the root [`README.md`](../README.md).
Focus here is on process boundaries, data flow, invariants, and the
small number of "why is it this way" decisions that are easy to
second-guess later.

---

## Process topology

```
                         Ethereum L1
                              │
                              │ JSON-RPC
                              ▼
   ┌──────────────────────────────────────────────────┐
   │  @setcode/indexer  (Ponder 0.16, Node)           │
   │                                                  │
   │  ├── block handler: scans type-4 txs + canary    │
   │  │   events + registry events                    │
   │  ├── writes: delegation_event, on_chain_sub,     │
   │  │   registry_classification*                    │
   │  └── own schema in Postgres (configurable)       │
   └──────────────────────────────────────────────────┘
                              │
                              │ read-only SELECT on indexer tables
                              ▼
   ┌──────────────────────────────────────────────────┐
   │  @setcode/watcher  (Node, 3 in-process subsystems)│
   │                                                  │
   │  ├── HTTP API      (Hono + @hono/node-server)    │
   │  │   /health /confirmations /check /manage/*     │
   │  │   /registry                                   │
   │  ├── Telegram bot  (Telegraf, long polling)      │
   │  │   /start c_<code>, /help, /list, /remove,     │
   │  │   /manage                                     │
   │  └── Dispatcher    (5s ± 10% jitter poll loop)   │
   │       ├── reads delegation_event past cursor     │
   │       ├── classifies via registry precedence     │
   │       ├── formats + sends via Telegram API       │
   │       ├── idempotent insert into alerts_sent     │
   │       └── advances singleton dispatcher_cursor   │
   └──────────────────────────────────────────────────┘
                              │
                              │ HTTP (internal network or through Caddy)
                              ▼
   ┌──────────────────────────────────────────────────┐
   │  @setcode/app      (Nuxt 3 SSR)                  │
   │  landing + lookup + subscribe + manage + registry│
   └──────────────────────────────────────────────────┘
                              ▲
                              │ HTTPS
                              │
                          end user
```

Three **independent processes** share **one Postgres instance**.
They communicate via shared tables (indexer → watcher) and internal
HTTP (app → watcher). Each process is restartable without the others.

---

## Package map

| Package | Language | Purpose | Public surface |
| --- | --- | --- | --- |
| `shared` | TS | Types, constants, static registry, chain table | imported by every TS package |
| `contracts` | Solidity 0.8.28 | `SetCodeRegistry`, `DelegationCanary` | ABIs consumed by indexer; addresses in env |
| `indexer` | TS (Ponder) | L1 reader, write-only to its own tables | none — other services read its tables |
| `watcher` | TS (Node) | Bot + HTTP + dispatcher | HTTP API (internal), Telegram bot |
| `app` | TS (Nuxt) | Web UI | HTTP (public via Caddy) |

---

## Data flow: a delegation alert, end to end

1. **User signs a type-4 tx** delegating EOA → target. Tx is included
   in block N on mainnet.
2. **Indexer** processes block N. Its block handler reads the block's
   transactions, filters to type-4, decodes each `authorizationList`
   via viem (Ponder's typed `Transaction` does not yet expose it), and
   inserts one `delegation_event` row per authorization whose signer
   differs from the previous `delegation_state` for that EOA.
3. **Dispatcher** polls `delegation_event` past its singleton cursor.
   For each new row it:
   - Resolves the target's classification by precedence: on-chain
     `registry_classification_state` → static `shared/registry.json` →
     `unknown`.
   - Joins against `subscriptions WHERE confirmed = true AND eoa = …`
     to find chats to notify.
   - For each `(tx_hash, chat_id)` pair it has not already sent, formats
     a Telegram message and calls the Bot API.
   - On success, inserts into `alerts_sent(tx_hash, chat_id, …)`. The
     `UNIQUE(tx_hash, chat_id)` constraint makes retries safe.
   - On transient failure (HTTP 5xx, network), the loop halts and
     retries the whole batch next tick — cursor does not advance.
   - On permanent failure (403, chat not found), it logs, inserts a
     tombstone row into `alerts_sent`, and advances.
4. **Cursor** advances to `max(delegation_event.id)` processed. This is
   the single at-least-once boundary.

Time from block inclusion to Telegram push, steady state: ~5–15 s on a
healthy RPC + dispatcher. Latency budget:

- Ponder indexing lag: 2–6 s (one extra `eth_getBlockByNumber` per
  block).
- Dispatcher poll: 0–5 s (5 s period with 10% jitter).
- Telegram API round-trip: ~0.5 s.

---

## Key invariants

These show up throughout the code. A change that violates one of them
should be treated as a breaking architectural change.

### I1. Postgres, everywhere

Dev, CI, and prod all run real Postgres (production) or
`@electric-sql/pglite` (tests — real Postgres compiled to WASM, same
regex CHECK constraints). No SQLite dialect drift. Drizzle ORM is
configured with the Postgres dialect only.

Why: the watcher depends on CHECK constraints (address regex,
classification enum), `ON CONFLICT ... DO NOTHING`, and Postgres-only
functions for retention sweeps. Supporting SQLite would mean two code
paths or a lowest-common-denominator schema. Not worth it.

### I2. Indexer is append-only

The indexer only writes rows; it never updates or deletes. If the rules
for identifying a delegation change, we re-index the range — we do not
backfill updates in place. This makes the indexer trivially replayable
and lets the watcher use cheap `WHERE id > cursor` scans.

### I3. Dispatcher is at-least-once, idempotent

The cursor row `dispatcher_cursor(id=1, last_event_id)` advances only
after a batch is fanned out. Crashes replay the in-flight batch; the
`alerts_sent UNIQUE(tx_hash, chat_id)` index turns duplicate sends into
no-ops.

There is exactly one cursor row, ever. It is seeded by migration and
updated in place.

### I4. Classification precedence is fixed

On-chain `SetCodeRegistry` state > static `shared/registry.json` >
`unknown`. This order is encoded in `watcher/src/services/classification.ts`
and re-used by the indexer-read path. Changing the order is a breaking
user-facing change — the UI copy ("Match from the on-chain registry" vs
"Match from the committed static registry") depends on it.

Downgrading a target from verified to malicious does **not** require a
package release — it's a single on-chain tx.

### I5. Telegram is the only channel

The watcher has no concept of "send via email". The alert dispatcher
speaks directly to the Telegram Bot API. Adding another channel would
mean a second fanout step; kept out of MVP on purpose.

### I6. No custody

The service never holds, signs, or forwards keys or transactions. The
worst abuse vector is alert spam, bounded by per-chat soft caps and the
5-minute confirmation TTL.

---

## Schemas at a glance

### Indexer (`indexer/ponder.schema.ts`)

- `delegation_state` — current target per (eoa, chainId). Upserted.
- `delegation_event` — append-only history of transitions.
- `on_chain_subscription*` — `DelegationCanary` events, for users who
  want an on-chain subscription record.
- `registry_classification*` — `SetCodeRegistry` events replayed into
  tables.

### Watcher (`watcher/src/db/schema.ts`)

- `subscriptions` — `(id, eoa, telegram_chat_id, telegram_username,
  confirmed, created_at)`. Unique on `(eoa, telegram_chat_id)`.
- `pending_confirmations` — one-time codes with 5-min TTL.
- `alerts_sent` — `(tx_hash, telegram_chat_id)` idempotency index.
- `manage_tokens` — bearer tokens for `/manage/:token`, minted via
  `/manage` in the bot.
- `dispatcher_cursor` — singleton `id=1`, advances after each batch.

See `watcher/README.md` for the full column-by-column reference.

---

## HTTP API

All endpoints live on the watcher; the Nuxt app is the only caller.
Caddy path-strips `/api/*` → watcher, so the browser hits one origin
and CORS never enters the picture.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Liveness probe |
| POST | `/check` | `{eoa}` → classification + source |
| POST | `/confirmations` | `{eoa, telegramChatId?}` → one-time code + TTL |
| GET | `/manage/:token` | List confirmed EOAs for the chat that owns the token |
| POST | `/manage/:token/remove` | Remove one EOA from that chat |
| GET | `/registry` | Paginated, filterable classification list |

Responses use discriminated-union error shapes, not HTTP status
decoding. See `useWatcherApi` in the app for the client-side mapping
to `WatcherApiError`.

---

## Telegram bot

Long-polling only (no webhook). Commands:

| Command | Arg | Effect |
| --- | --- | --- |
| `/start c_<code>` | confirmation code | Binds the calling chat to the EOA behind the code |
| `/help` | — | Usage summary |
| `/list` | — | List confirmed EOAs for the calling chat |
| `/remove <addr>` | address | Unsubscribe the calling chat from that EOA |
| `/manage` | — | Mint a `/manage/:token` bearer for the caller, reply with URL |

Long polling means no inbound HTTP surface is exposed for the bot.
Deploying behind NAT or in Docker with no port published is fine.

---

## On-chain surface

### `SetCodeRegistry`

Role-gated classification registry. `CLASSIFIER_ROLE` calls
`classify(target, class, reason)`; `DEFAULT_ADMIN_ROLE` is the only
role that can unstick `Malicious` via `downgradeMalicious(...)`.
Distinct events (`Classified` vs `MaliciousDowngraded`) let the indexer
and UI distinguish normal classification from a policy reversal. See
[`GOVERNANCE.md`](./GOVERNANCE.md).

### `DelegationCanary`

Optional advisory-signal contract. Stateless, emit-only. `subscribe()`
emits `Subscribed(eoa, channelHash)`, `unsubscribe()` emits
`Unsubscribed(eoa)`. Used by people who want an on-chain, censorship-
resistant record of their subscription intent. The watcher does not
consult it for alert delivery — Telegram confirmation is still
required.

---

## Frontend

Nuxt 3 SSR app. Pages:

- `/` — landing + unified lookup / subscribe / watch flow.
- `/manage/:token` — token-gated subscription manager.
- `/registry` — filterable classification browser.

Design-system primitives (`GButton`, `GInput`, `GCard`, `GBadge`,
`GAddress`, `GCodeBlock`, `GConnectButton`, `GThemeToggle`) live under
`app/components/` with the `G` prefix. Tokens under
`app/assets/css/tokens.css` drive a warm-minimal palette with a dark
variant. Pre-hydration inline script reconciles saved theme before
paint, preventing FOUC.

i18n is flat keys only (`t(key, vars)`). Single catalog today
(`app/i18n/en.ts`); shape-compatible with a future i18n library so
callers never change.

---

## Deployment surface

One Compose stack in `infra/`:

- `postgres` — data volume, shared by watcher + indexer (separate
  schemas).
- `watcher-migrate` — one-shot, runs `pnpm db:migrate`, exits 0.
- `watcher`, `indexer`, `app` — long-running.
- `caddy` — terminates TLS, path-routes `/api/*` → watcher, `/*` → app.

Local dev override (`docker-compose.override.yml`) drops Caddy and
exposes the three service ports directly (3000, 8787, 5433) for manual
testing on localhost. See [`OPERATIONS.md`](./OPERATIONS.md) for the
full first-boot runbook.

---

## What's deliberately simple

- **No message broker.** Postgres LISTEN/NOTIFY would shave off 2–5 s
  of dispatcher latency, but Postgres is already in the stack and
  polling is fine at current event rates.
- **No separate metrics DB.** Prometheus scrapes the watcher directly
  (lands in step 16); retention is cheap.
- **No Redis.** Rate limiting and idempotency use Postgres. One less
  moving piece.
- **No event bus between packages.** The watcher reads the indexer's
  tables. The app calls the watcher's HTTP API. That's it.

Each of these is a deliberate choice to keep the surface small until
scale forces a change.
