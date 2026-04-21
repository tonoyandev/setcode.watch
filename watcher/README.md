# @setcode/watcher

Alerting service for SetCode.watch. Owns the Postgres schema, the Telegram bot, the HTTP API the web app calls, and (in a later step) the alert dispatch loop.

## What ships today

- **Database** — four tables managed via Drizzle. See [src/db/schema.ts](src/db/schema.ts).
- **Confirmations service** — pure business logic for the EOA ↔ Telegram binding flow. 5-minute code TTL, 10-subs-per-chat soft cap (env-tunable).
- **Telegram bot** (Telegraf, long polling) — commands `/start`, `/help`, `/list`, `/remove <address>`.
- **HTTP API** (Hono) — `POST /confirmations` creates a pending code and returns a `t.me` deep-link for the web app to render.

The alert dispatch loop and the `/manage` token flow land in subsequent steps.

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

34 tests across four suites:

- `schema.test.ts` — migrations apply cleanly, UNIQUE and CHECK constraints fire correctly against pglite.
- `confirmations.test.ts` — service behaviour end-to-end against a real Postgres: happy path, expired TTL, already subscribed, soft cap, many-to-many, remove, sweep.
- `handlers.test.ts` — pure handler logic with a mocked service. Covers payload parsing, `t()` rendering, and EOA lowercase normalisation.
- `http.test.ts` — Hono `app.request()` tests covering happy path, bad JSON, missing fields, and bad EOA.
