// Prometheus metrics registry for the watcher.
//
// One module-scoped `Registry` holds every counter / gauge / histogram the
// watcher emits. The HTTP server mounts `GET /metrics` and calls
// `registry.metrics()` for the scrape body; the dispatcher loop calls the
// typed helpers below on each tick.
//
// prom-client's process-level defaults (event loop lag, heap, GC) are opt-in
// via `collectDefaultMetrics` in index.ts — we don't enable them inside tests
// because they hook into the real process and interfere with vitest isolation.

import {
  Counter,
  type CounterConfiguration,
  Gauge,
  type GaugeConfiguration,
  Histogram,
  type HistogramConfiguration,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

const PREFIX = 'setcode_watcher_';

// A single registry per process is the normal pattern. Tests use
// `resetMetrics()` to clear values between cases.
export const registry = new Registry();

function counter<T extends string>(config: CounterConfiguration<T>): Counter<T> {
  return new Counter({ ...config, registers: [registry] });
}
function gauge<T extends string>(config: GaugeConfiguration<T>): Gauge<T> {
  return new Gauge({ ...config, registers: [registry] });
}
function histogram<T extends string>(config: HistogramConfiguration<T>): Histogram<T> {
  return new Histogram({ ...config, registers: [registry] });
}

// --------------------------------------------------------------------------
// Dispatcher metrics
// --------------------------------------------------------------------------

export const dispatcherTicksTotal = counter({
  name: `${PREFIX}dispatcher_ticks_total`,
  help: 'Total dispatcher loop ticks executed.',
  labelNames: ['outcome'] as const,
});

export const dispatcherTickDurationSeconds = histogram({
  name: `${PREFIX}dispatcher_tick_duration_seconds`,
  help: 'Duration of a single dispatcher tick in seconds.',
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

export const dispatcherEventsProcessedTotal = counter({
  name: `${PREFIX}dispatcher_events_processed_total`,
  help: 'Total delegation events read past the cursor.',
});

export const dispatcherSendTotal = counter({
  name: `${PREFIX}dispatcher_send_total`,
  help: 'Total Telegram send attempts broken down by outcome.',
  labelNames: ['result'] as const,
});

// Cursor position. We can't compute chain-tip lag without calling the RPC,
// but (block, timestamp) at the cursor is a useful scalar. Alerting rules
// on "cursor hasn't moved in N minutes" work off this plus scrape timestamps.
export const dispatcherCursorLastBlock = gauge({
  name: `${PREFIX}dispatcher_cursor_last_block`,
  help: 'Last delegation-event block number the dispatcher advanced past.',
});

export const dispatcherRetentionSweptTotal = counter({
  name: `${PREFIX}dispatcher_retention_swept_total`,
  help: 'Total alerts_sent rows deleted by the retention sweep.',
});

// --------------------------------------------------------------------------
// HTTP metrics
// --------------------------------------------------------------------------

export const httpRequestsTotal = counter({
  name: `${PREFIX}http_requests_total`,
  help: 'Total HTTP requests handled by the watcher API.',
  labelNames: ['method', 'route', 'status'] as const,
});

export const httpRequestDurationSeconds = histogram({
  name: `${PREFIX}http_request_duration_seconds`,
  help: 'Duration of HTTP requests in seconds.',
  labelNames: ['method', 'route'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

// --------------------------------------------------------------------------
// Dispatch helpers — thin wrappers that centralise label values so callers
// can't typo them. Every label that appears in a metric definition's
// `labelNames` must be provided; TypeScript enforces this at the call site.
// --------------------------------------------------------------------------

export type TickOutcome = 'ok' | 'error';
export type SendResult = 'success' | 'permanent_fail' | 'transient_fail';

export function recordTick(outcome: TickOutcome, durationSeconds: number): void {
  dispatcherTicksTotal.inc({ outcome });
  dispatcherTickDurationSeconds.observe(durationSeconds);
}

export function recordSend(result: SendResult, count = 1): void {
  if (count > 0) dispatcherSendTotal.inc({ result }, count);
}

export function recordEventsProcessed(count: number): void {
  if (count > 0) dispatcherEventsProcessedTotal.inc(count);
}

export function recordRetentionSwept(count: number): void {
  if (count > 0) dispatcherRetentionSweptTotal.inc(count);
}

export function setCursorLastBlock(block: bigint | number | null): void {
  if (block === null) {
    dispatcherCursorLastBlock.set(0);
    return;
  }
  // Gauges take plain numbers. Block numbers fit in a double comfortably
  // for the lifetime of Ethereum; if that changes, the metric will still
  // be monotonic and useful, just imprecise beyond 2^53.
  dispatcherCursorLastBlock.set(Number(block));
}

export function recordHttp(
  method: string,
  route: string,
  status: number,
  durationSeconds: number,
): void {
  const labels = { method, route, status: String(status) };
  httpRequestsTotal.inc(labels);
  httpRequestDurationSeconds.observe({ method, route }, durationSeconds);
}

// --------------------------------------------------------------------------
// Registry accessors
// --------------------------------------------------------------------------

export async function renderMetrics(): Promise<{ body: string; contentType: string }> {
  return {
    body: await registry.metrics(),
    contentType: registry.contentType,
  };
}

// Wired from index.ts in production; left out of tests so vitest isolation
// isn't poisoned by the real event-loop and GC probes.
export function startDefaultMetrics(): void {
  collectDefaultMetrics({ register: registry, prefix: PREFIX });
}

// Test helper. Clears every counter / gauge / histogram value without
// dropping the metric definitions themselves.
export function resetMetrics(): void {
  registry.resetMetrics();
}
