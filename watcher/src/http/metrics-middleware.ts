// Hono middleware that records HTTP request counts and durations to the
// Prometheus registry. Route label comes from `c.req.routePath` so
// `/manage/:token` is one label, not a cardinality explosion over real
// tokens.
//
// Applied before the route handlers; the `await next()` unwinds after the
// response is built so `c.res.status` is populated.

import type { Context, MiddlewareHandler } from 'hono';
import { recordHttp } from '../lib/metrics.js';

// Routes we don't want in the metrics (the scrape endpoint itself and
// liveness pings). Keeping them out cuts noise and avoids self-
// referential scrape-rate artefacts.
const IGNORED_ROUTES = new Set<string>(['/metrics', '/health']);

export function metricsMiddleware(recorder: typeof recordHttp = recordHttp): MiddlewareHandler {
  return async function metricsInstrument(c: Context, next: () => Promise<void>) {
    const start = performance.now();
    let status = 0;
    try {
      await next();
      status = c.res.status;
    } catch (err) {
      // Propagate but record as a 5xx so error paths appear in the counter.
      status = 500;
      throw err;
    } finally {
      const route = c.req.routePath || c.req.path || 'unknown';
      if (!IGNORED_ROUTES.has(route)) {
        const durationSeconds = (performance.now() - start) / 1000;
        recorder(c.req.method, route, status || 0, durationSeconds);
      }
    }
  };
}
