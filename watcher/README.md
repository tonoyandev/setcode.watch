# @setcode/watcher

Alerting service for SetCode.watch. Owns the Postgres schema, the Telegram bot, the HTTP API the web app calls, and (in a later step) the alert dispatch loop.

## What ships today

- **Database** — five tables managed via Drizzle. See [src/db/schema.ts](src/db/schema.ts).
- **Confirmations service** — pure business logic for the EOA ↔ Telegram binding flow. 5-minute code TTL, 10-subs-per-chat soft cap (env-tunable).
- **Telegram bot** (Telegraf, long polling) — commands `/start`, `/help`, `/list`, `/remove <address>`.
- **HTTP API** (Hono) — `POST /confirmations` creates a pending code and returns a `t.me` deep-link for the web app to render.
- **Alert dispatcher** — polls Ponder's `delegation_event` table every ~5s (±10% jitter), resolves classifications, fans alerts to confirmed subscribers, and keeps a singleton cursor so no event is fanned twice. Retention sweep runs hourly.

The `/manage` token flow and registry-browser read endpoints are now live for the Nuxt web app.

## Confirmation flow

```
Web UI                    HTTP API                Postgres                 Telegram
  │                          │                        │                        │
  │ POST /confirmations      │                        │                        │
  │ { eoa }                  │                        │                        │
  ├─────────────────────────▶│                        │                        │
  │                          │ INSERT pending (code)  │                        │
  │                          ├───────────────────────▶│                        │
  │ { deepLink, expiresAt }  │                        │                        │
  │◀─────────────────────────┤                        │                        │
  │                                                                            │
  │ user clicks deep-link ────────────────────────────────────────────────────▶│
  │                                                                            │
  │                                            /start c_<code>                 │
  │                          ◀─────────────────────────────────────────────────┤
  │                          │ confirm:                                        │
  │                          │   look up pending → insert subscription         │
  │                          │   (eoa + chat_id) → delete pending              │
  │                          ├───────────────────────▶│                        │
  │                          │ reply "Subscribed." ──────────────────────────▶ │
```

Codes are 16-char base62 with a `c_` prefix (≈95 bits entropy). The prefix lets the bot distinguish future payload types (invite links, recovery flow) without a format collision.

## Tables

| Table                   | Purpose                                                                   |
| ----------------------- | ------------------------------------------------------------------------- |
| `subscriptions`         | Confirmed EOA ↔ Telegram chat bindings (many-to-many).                    |
| `pending_confirmations` | Short-lived codes. 5-minute default TTL. No chat_id column — set at confirm time. |
| `alerts_sent`           | Dispatch audit log. Idempotent on `(tx_hash, telegram_chat_id)`.          |
| `manage_tokens`         | Opaque UUIDs for the web `/manage` flow. Revoke via bot command.          |
| `dispatcher_cursor`     | Singleton (id = 1). `(last_block, last_id)` tuple marking the last delegation event fanned to alerts. |

Keys and invariants:

- `subscriptions` enforces `UNIQUE(eoa, telegram_chat_id)`. Same EOA may be watched from multiple chats; one chat may watch multiple EOAs.
- `alerts_sent` enforces `UNIQUE(tx_hash, telegram_chat_id)` so the dispatcher is safe to retry without spamming.
- Hex columns carry `CHECK` constraints pinning them to lowercase `0x…`. Callers must normalise before insert (see `src/lib/address.ts`).
- Classification columns are constrained to `'unknown' | 'verified' | 'malicious'` matching `@setcode/shared`.

## HTTP API

```
GET  /health                 → 200 { ok: true }
POST /confirmations          → 200 { code, deepLink, expiresAt }
                               400 { error: 'invalid_json' | 'invalid_body' | 'invalid_eoa' }
POST /check                  → 200 { eoa, chainId, currentTarget, classification, source, lastUpdated }
GET  /manage/:token          → 200 { subscriptions[] } | 404 { error: 'not_found' }
POST /manage/:token/remove   → 200 { removed } | 404 { error: 'not_found' }
GET  /registry               → 200 { entries[], nextCursor } (query: classification?, cursor?, limit?)
```

CORS allow-list is configured via `WATCHER_CORS_ORIGIN` (comma-separated). Default `http://localhost:3000` for the Nuxt dev server.

## Bot commands

| Command             | Behaviour                                                     |
| ------------------- | ------------------------------------------------------------- |
| `/start c_<code>`   | Binds the EOA behind `<code>` to this chat. 5-minute window.  |
| `/start` (no arg)   | Prints a welcome pointing to setcode.watch.                   |
| `/help`             | Lists available commands.                                     |
| `/list`             | Shows confirmed EOAs for this chat.                           |
| `/remove <eoa>`     | Unsubscribes this chat from the given EOA.                    |

All user-facing strings live in `src/i18n/en.ts` and route through `t(key, vars)`. A later step will swap that for a multi-locale layer with zero caller changes.

## Alert dispatcher

The dispatcher is an in-process polling loop launched alongside the bot and HTTP API. It reads Ponder's `delegation_event` / `registry_classification_state` tables (see [src/db/ponder-read.ts](src/db/ponder-read.ts)) and writes to the watcher's own tables.

Per tick:

1. Read `dispatcher_cursor` (singleton, id = 1). On first boot the cursor is initialised at the current head of `delegation_event` so historical events do not fan out.
2. Fetch up to `WATCHER_DISPATCH_BATCH_SIZE` events with `(block_number, id) > cursor`, ordered by `(block_number, id)`.
3. For each event: look up confirmed subscribers for the EOA, skip chats already in `alerts_sent` for this tx, classify old/new targets, build the message, send via Telegram.
4. On **ok**: insert `alerts_sent` (ON CONFLICT DO NOTHING) and advance the cursor past this event.
5. On **permanent** failure (`403 Forbidden`, `chat not found`, etc.): log and advance — the chat is unreachable and will not be retried.
6. On **transient** failure (`429`, `5xx`, network): stop, do not advance the cursor. Next tick's preflight skips chats we already delivered to, so retries are idempotent.

Retention runs every `WATCHER_RETENTION_SWEEP_INTERVAL_MS` (default 1 hour) inside the same loop. It deletes `alerts_sent` rows older than `ALERT_RETENTION_DAYS`, in batches of `WATCHER_RETENTION_SWEEP_BATCH_SIZE`, to avoid long locks during catch-up.

Classification resolution order: on-chain `registry_classification_state` → `@setcode/shared` static registry → `unknown`. The on-chain registry wins so targets can be downgraded (verified → malicious) without a package release.

## i18n

MVP is English-only. The `t()` helper is shape-preserving so a future i18n library (i18next, @formatjs/intl) plugs in behind it without changes to handlers. Telegram does not pass user locale natively, so switching will require a `/lang` command and per-chat locale state — feature-creep for MVP.

## Stack

- Postgres only across dev, CI, and prod (no SQLite dialect drift).
- `drizzle-orm` + `drizzle-kit` for schema, types, and migration generation.
- `postgres` (postgres-js) as the production driver.
- `@electric-sql/pglite` — real Postgres compiled to WASM — for fast unit tests. No stripped features: regex CHECK constraints fire in tests just as in prod.
- `telegraf` for the bot; `hono` + `@hono/node-server` for the HTTP API.

## Environment

See `.env.example`. For local dev:

```
DATABASE_URL=postgres://setcode:setcode@localhost:5432/setcode
TELEGRAM_BOT_TOKEN=…          # from @BotFather
TELEGRAM_BOT_USERNAME=…       # without leading @
```

All other vars have safe defaults.

## Commands

```
pnpm --filter @setcode/watcher dev           # hot-reload bot + HTTP API
pnpm --filter @setcode/watcher start         # production mode
pnpm --filter @setcode/watcher db:generate   # regenerate migrations from schema.ts
pnpm --filter @setcode/watcher db:migrate    # apply migrations to $DATABASE_URL
pnpm --filter @setcode/watcher db:studio     # browse schema and data
pnpm --filter @setcode/watcher typecheck
pnpm --filter @setcode/watcher test          # vitest + pglite
```

## Tests

53 tests across seven suites:

- `schema.test.ts` — migrations apply cleanly, UNIQUE and CHECK constraints fire correctly against pglite.
- `confirmations.test.ts` — service behaviour end-to-end against a real Postgres: happy path, expired TTL, already subscribed, soft cap, many-to-many, remove, sweep.
- `handlers.test.ts` — pure handler logic with a mocked service. Covers payload parsing, `t()` rendering, and EOA lowercase normalisation.
- `http.test.ts` — Hono `app.request()` tests covering happy path, bad JSON, missing fields, and bad EOA.
- `messages.test.ts` — alert message formatter: malicious / verified / unknown / revoked headlines, explorer link fallback.
- `classification.test.ts` — on-chain registry state wins; static-registry and `unknown` fallbacks.
- `dispatcher.test.ts` — cursor init at head, fan-out to multiple subscribers, transient retry without duplicate sends, permanent failure advances cursor, ordering by `(block_number, id)`, retention sweep.
