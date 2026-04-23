// Ponder's `ponder start` (production mode) requires this file to exist.
// The indexer is headless — no GraphQL / HTTP consumers — so the API is a
// single liveness endpoint that compose's healthcheck or an ops probe can hit.
//
// Dev mode (`ponder dev`) tolerates the absence of this file; keeping it
// minimal so we don't commit to a public contract we'd have to version.

import { Hono } from 'hono';

const app = new Hono();

// Ponder reserves `/health`, `/ready`, `/status`, `/metrics` for its own
// endpoints. Namespace our ping under `/indexer/ping` so it can't collide.
app.get('/indexer/ping', (c) => c.json({ ok: true }));

export default app;
