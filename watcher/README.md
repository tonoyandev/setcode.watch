# @setcode/watcher

Alerting service for SetCode.watch. This package owns the Postgres schema, the Telegram bot, and the alert dispatch loop. This first slice delivers only the database layer — bot and dispatcher land in subsequent steps.

## Tables

| Table                   | Purpose                                                                   |
| ----------------------- | ------------------------------------------------------------------------- |
| `subscriptions`         | Confirmed EOA ↔ Telegram chat bindings (many-to-many).                    |
| `pending_confirmations` | Short-lived one-time codes (5 min TTL by default).                        |
| `alerts_sent`           | Dispatch audit log. Idempotent on `(tx_hash, telegram_chat_id)`.          |
| `manage_tokens`         | Opaque UUIDs used by the web UI for the `/manage` flow. Revoke via bot.   |

Keys and invariants:

- `subscriptions` enforces `UNIQUE(eoa, telegram_chat_id)`. The same EOA may be watched from multiple chats; a single chat may watch multiple EOAs. Anti-abuse soft cap is set by `MAX_SUBSCRIPTIONS_PER_CHAT` and enforced in application code, not the schema.
- `alerts_sent` enforces `UNIQUE(tx_hash, telegram_chat_id)` so the dispatcher is safe to retry without spamming.
- Hex columns carry `CHECK` constraints pinning them to lowercase `0x…`. Callers must normalise before insert.
- Classification columns are constrained to `'unknown' | 'verified' | 'malicious'` matching `@setcode/shared`.

## Stack

- Postgres only across every environment. See the comment in the step-6 commit for the no-SQLite rationale.
- `drizzle-orm` + `drizzle-kit` for schema, types, and migration generation.
- `postgres` (postgres-js) as the driver.
- `pg-mem` for fast unit tests.
- Integration tests against a real Postgres service run in CI (added in a later step).

## Environment

See `.env.example`. `DATABASE_URL` is always required. Bot and dispatcher env vars (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`) land with those features.

## Commands

```
pnpm --filter @setcode/watcher db:generate   # regenerate migrations from schema.ts
pnpm --filter @setcode/watcher db:migrate    # apply migrations to $DATABASE_URL
pnpm --filter @setcode/watcher db:studio     # browse schema and data
pnpm --filter @setcode/watcher typecheck
pnpm --filter @setcode/watcher test          # vitest + pg-mem
```

## Tests

`src/__tests__/schema.test.ts` loads the generated migration into pg-mem and asserts:

- all four tables exist,
- the `(eoa, telegram_chat_id)` uniqueness holds and both many-to-many directions are allowed,
- `alerts_sent` is idempotent per `(tx_hash, chat)` and permits the same tx for different chats,
- classification values outside the allowed set are rejected,
- `manage_tokens` stores a nullable `revoked_at`.

Regex `CHECK` constraints (lowercase-hex format pins) are stripped in the pg-mem loader because pg-mem 3.x does not implement the `~` operator. Those constraints are validated against a real Postgres instance in the CI integration step.
