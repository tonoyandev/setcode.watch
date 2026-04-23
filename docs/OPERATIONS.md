# Operations — self-hosting SetCode.watch

First-boot runbook and day-2 ops notes for operators running the whole stack
on a single Linux host. The deploy surface lives in [`infra/`](../infra/)
and is driven by `docker compose`.

## Topology

```
 Internet
    │  :80 / :443
    ▼
 ┌───────┐   (internal bridge network)
 │ caddy │──► app:3000         (Nuxt 3 SSR)
 │       │──► watcher:8787     (Telegraf bot + Hono API)
 └───────┘       │
                 ▼
              postgres:5432 ◄── indexer (Ponder, no exposed port)
```

Only Caddy publishes ports on the host. Caddy terminates TLS and
path-routes `/api/*` to the watcher (stripping the prefix) and `/*` to the
Nuxt app, so the browser only ever talks to one origin — no CORS, one
certificate.

## Host requirements

- Linux x86_64 with Docker ≥ 24 and the Compose v2 plugin.
- ~2 GB RAM free, ~10 GB disk (Postgres + indexer state grow over time).
- A DNS A (and optionally AAAA) record pointing `DOMAIN` at the host **before**
  first `up` — Caddy needs to reach the ACME HTTP-01 challenge on port 80.
- Outbound HTTPS to Let's Encrypt, Telegram, and your Ethereum RPC provider.

## First boot

1. **Clone the repo with submodules** (contracts pulls Foundry libs as
   submodules):

   ```sh
   git clone --recurse-submodules https://github.com/<you>/setcode.watch.git
   cd setcode.watch
   ```

2. **Point DNS at the host**. Create an A record for your domain. Verify
   with `dig +short <domain>` before proceeding.

3. **Create and fill `infra/.env`**:

   ```sh
   cp infra/.env.example infra/.env
   $EDITOR infra/.env
   ```

   Required fields (compose will refuse to start without them):

   - `DOMAIN`, `ACME_EMAIL`
   - `POSTGRES_PASSWORD` (generate a long random string)
   - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` (from @BotFather)
   - `ETH_RPC_URL`, `PONDER_START_BLOCK`

4. **Bring the stack up** from the repo root:

   ```sh
   docker compose -f infra/docker-compose.yml --env-file infra/.env up -d
   ```

   Startup order (enforced by `depends_on`):

   1. `postgres` becomes healthy.
   2. `watcher-migrate` runs `pnpm db:migrate`, exits 0.
   3. `watcher`, `indexer`, `app` start.
   4. `caddy` starts and requests a cert for `DOMAIN`.

   First boot is slower because Ponder backfills from `PONDER_START_BLOCK`
   to chain tip. Follow progress with `docker compose ... logs -f indexer`.

5. **Sanity checks**:

   ```sh
   # watcher API (through Caddy)
   curl -fsSL https://$DOMAIN/api/health

   # Nuxt app
   curl -fsSLI https://$DOMAIN/ | head -1

   # Telegram: DM the bot with /start, it should reply.
   ```

## Day-2 operations

### Logs

```sh
docker compose -f infra/docker-compose.yml --env-file infra/.env logs -f
docker compose -f infra/docker-compose.yml --env-file infra/.env logs -f watcher
```

### Apply new migrations

Migrations are idempotent and run via the one-shot `watcher-migrate` sidecar
on every `up`. To apply after a git pull:

```sh
git pull
docker compose -f infra/docker-compose.yml --env-file infra/.env build watcher watcher-migrate
docker compose -f infra/docker-compose.yml --env-file infra/.env up -d
```

The sidecar gates the watcher via `depends_on.condition:
service_completed_successfully`, so the watcher only starts after the
migrations exit 0.

### Restart a single service

```sh
docker compose -f infra/docker-compose.yml --env-file infra/.env restart watcher
```

### Rebuild after code changes

```sh
docker compose -f infra/docker-compose.yml --env-file infra/.env build --pull
docker compose -f infra/docker-compose.yml --env-file infra/.env up -d
```

### Backup Postgres

The compose file stores Postgres on the named volume `pgdata`. Take logical
backups with `pg_dump` from the container:

```sh
docker compose -f infra/docker-compose.yml --env-file infra/.env exec postgres \
  pg_dump -U setcode setcode | gzip > backup-$(date +%F).sql.gz
```

Store the dumps off-host. The watcher's data (chats, subscriptions, alerts)
is the only part that is hard to reconstruct — Ponder state can be re-indexed
from scratch if lost, at the cost of a few hours of backfill.

### Restore Postgres

Scratch volume and reimport:

```sh
docker compose -f infra/docker-compose.yml --env-file infra/.env down
docker volume rm setcode-watch_pgdata
docker compose -f infra/docker-compose.yml --env-file infra/.env up -d postgres
gunzip -c backup-YYYY-MM-DD.sql.gz | \
  docker compose -f infra/docker-compose.yml --env-file infra/.env exec -T postgres \
  psql -U setcode setcode
docker compose -f infra/docker-compose.yml --env-file infra/.env up -d
```

### Rotate the Telegram token

Paste the new token into `infra/.env`, then:

```sh
docker compose -f infra/docker-compose.yml --env-file infra/.env up -d watcher
```

Compose recreates the watcher container with the new env. Existing long-poll
connections to Telegram drop and reconnect; no migration needed.

## Troubleshooting

**Caddy loops on ACME errors.** DNS is not pointing at the host yet, or port
80 is blocked. `docker compose ... logs caddy` will have the raw Let's Encrypt
error.

**`watcher-migrate` exits non-zero.** Usually a DB connectivity or schema
drift issue. Run it manually to see the full stack:

```sh
docker compose -f infra/docker-compose.yml --env-file infra/.env run --rm watcher-migrate
```

**Ponder stuck at an old block.** Check the `indexer` logs for RPC rate-limit
errors. Add `ETH_RPC_FALLBACK_1`/`_2` in `infra/.env` and restart the indexer.

**Bot says "check again in a few seconds" forever.** The watcher cannot see
fresh delegation rows from Ponder — either the indexer is behind, or the two
services are pointed at different databases. Compare `DATABASE_URL` across
the three compose services.

## Metrics

Both the watcher and the indexer expose Prometheus metrics on their internal
container ports:

- `watcher:8787/metrics` — dispatcher ticks, send outcomes, cursor block,
  HTTP request histogram, Node.js process metrics (heap, event loop lag,
  GC). Series are prefixed `setcode_watcher_`.
- `indexer:42069/metrics` — Ponder's own metrics (indexing lag, RPC calls,
  handler durations). Shape matches upstream Ponder.

Neither endpoint is published to the host. Scrape them from a Prometheus
running on the same Docker network, for example:

```yaml
# prometheus.yml snippet
scrape_configs:
  - job_name: setcode-watcher
    static_configs: [{ targets: ['watcher:8787'] }]
  - job_name: setcode-indexer
    static_configs: [{ targets: ['indexer:42069'] }]
```

Caddy explicitly returns 404 for `/api/metrics` on the public surface —
`/metrics` is internal-only by design.

Useful alerts to start with:

- `rate(setcode_watcher_dispatcher_ticks_total{outcome="error"}[5m]) > 0`
  — dispatcher is failing ticks.
- `setcode_watcher_dispatcher_cursor_last_block` stagnant for >5m while
  the indexer is healthy — dispatcher is stuck.
- `rate(setcode_watcher_dispatcher_send_total{result="transient_fail"}[5m]) > 0.1`
  — Telegram API is flapping.

## Production hardening (beyond MVP)

- Put the host behind a firewall; only ports 80/443 should be reachable.
- Set up off-host Postgres backups on a schedule (cron + `pg_dump` + object
  storage).
- Monitor `https://$DOMAIN/api/health` from an external uptime checker.
- Pin a specific Ponder block range via env if you don't need full history.
- If you expose the watcher API publicly (without Caddy path-stripping),
  set `WATCHER_CORS_ORIGIN` explicitly and consider rate-limiting upstream.
