import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { metricsMiddleware } from '../http/metrics-middleware.js';
import {
  recordEventsProcessed,
  recordRetentionSwept,
  recordSend,
  recordTick,
  registry,
  renderMetrics,
  resetMetrics,
  setCursorLastBlock,
} from '../lib/metrics.js';

async function getMetric(name: string): Promise<string> {
  const text = await registry.metrics();
  const lines = text
    .split('\n')
    .filter((line) => line.startsWith(name) || line.startsWith(`# HELP ${name}`));
  return lines.join('\n');
}

describe('metrics registry', () => {
  beforeEach(() => {
    resetMetrics();
  });

  it('counts successful ticks with a duration observation', async () => {
    recordTick('ok', 0.02);
    recordTick('ok', 0.04);
    recordTick('error', 0.001);

    const ticks = await getMetric('setcode_watcher_dispatcher_ticks_total');
    expect(ticks).toContain('setcode_watcher_dispatcher_ticks_total{outcome="ok"} 2');
    expect(ticks).toContain('setcode_watcher_dispatcher_ticks_total{outcome="error"} 1');

    const duration = await getMetric('setcode_watcher_dispatcher_tick_duration_seconds');
    expect(duration).toContain('setcode_watcher_dispatcher_tick_duration_seconds_count 3');
  });

  it('breaks dispatcher_send_total down by outcome label', async () => {
    recordSend('success', 3);
    recordSend('permanent_fail', 1);
    recordSend('transient_fail', 2);
    // No-op calls with count 0 must not register any observation.
    recordSend('success', 0);

    const sends = await getMetric('setcode_watcher_dispatcher_send_total');
    expect(sends).toContain('setcode_watcher_dispatcher_send_total{result="success"} 3');
    expect(sends).toContain('setcode_watcher_dispatcher_send_total{result="permanent_fail"} 1');
    expect(sends).toContain('setcode_watcher_dispatcher_send_total{result="transient_fail"} 2');
  });

  it('tracks events processed and retention sweeps as monotonic counters', async () => {
    recordEventsProcessed(5);
    recordEventsProcessed(2);
    recordRetentionSwept(100);

    const events = await getMetric('setcode_watcher_dispatcher_events_processed_total');
    expect(events).toContain('setcode_watcher_dispatcher_events_processed_total 7');

    const swept = await getMetric('setcode_watcher_dispatcher_retention_swept_total');
    expect(swept).toContain('setcode_watcher_dispatcher_retention_swept_total 100');
  });

  it('exposes cursor_last_block as a gauge with bigint support', async () => {
    setCursorLastBlock(22_431_084n);
    let text = await getMetric('setcode_watcher_dispatcher_cursor_last_block');
    expect(text).toContain('setcode_watcher_dispatcher_cursor_last_block 22431084');

    setCursorLastBlock(null);
    text = await getMetric('setcode_watcher_dispatcher_cursor_last_block');
    expect(text).toContain('setcode_watcher_dispatcher_cursor_last_block 0');
  });

  it('renderMetrics returns the Prometheus text content type', async () => {
    const { body, contentType } = await renderMetrics();
    expect(contentType).toMatch(/^text\/plain/);
    expect(body).toMatch(/^# HELP/m);
  });
});

describe('metrics middleware', () => {
  beforeEach(() => {
    resetMetrics();
  });

  it('records method/route/status for successful requests', async () => {
    const captured: { method: string; route: string; status: number; duration: number }[] = [];
    const app = new Hono();
    app.use(
      '*',
      metricsMiddleware((method, route, status, duration) =>
        captured.push({ method, route, status, duration }),
      ),
    );
    app.get('/check/:addr', (c) => c.json({ ok: true }));

    const res = await app.request('/check/0xabc');
    expect(res.status).toBe(200);

    expect(captured).toHaveLength(1);
    const [first] = captured;
    if (!first) throw new Error('expected one captured entry');
    expect(first).toMatchObject({
      method: 'GET',
      route: '/check/:addr',
      status: 200,
    });
    expect(first.duration).toBeGreaterThanOrEqual(0);
  });

  it('skips /health and /metrics so scrapes do not pollute the counters', async () => {
    const captured: { route: string }[] = [];
    const app = new Hono();
    app.use(
      '*',
      metricsMiddleware((_m, route) => captured.push({ route })),
    );
    app.get('/health', (c) => c.json({ ok: true }));
    app.get('/metrics', (c) => c.text('# metrics'));
    app.get('/check', (c) => c.json({ ok: true }));

    await app.request('/health');
    await app.request('/metrics');
    await app.request('/check');

    expect(captured.map((e) => e.route)).toEqual(['/check']);
  });

  it('records a 500 when the downstream handler throws', async () => {
    const captured: { status: number }[] = [];
    const app = new Hono();
    app.use(
      '*',
      metricsMiddleware((_m, _r, status) => captured.push({ status })),
    );
    app.get('/check', () => {
      throw new Error('boom');
    });
    app.onError((_err, c) => c.text('boom', 500));

    const res = await app.request('/check');
    expect(res.status).toBe(500);
    expect(captured).toEqual([{ status: 500 }]);
  });
});
