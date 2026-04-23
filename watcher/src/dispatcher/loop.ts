import {
  recordEventsProcessed,
  recordRetentionSwept,
  recordSend,
  recordTick,
  setCursorLastBlock,
} from '../lib/metrics.js';
import type { DispatcherService } from '../services/dispatcher.js';

export interface DispatcherLoopOptions {
  pollIntervalMs: number;
  retentionSweepIntervalMs: number;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
  rng?: () => number;
}

export interface DispatcherLoopHandle {
  stop(): Promise<void>;
}

// Jitter ±10% de-synchronises concurrent dispatchers and spreads Postgres
// load. Deterministic in tests via options.rng.
function withJitter(baseMs: number, rng: () => number): number {
  const delta = (rng() * 2 - 1) * 0.1 * baseMs;
  return Math.max(50, Math.round(baseMs + delta));
}

export function startDispatcherLoop(
  service: DispatcherService,
  options: DispatcherLoopOptions,
): DispatcherLoopHandle {
  const log = options.logger ?? console;
  const rng = options.rng ?? Math.random;

  let stopped = false;
  let currentTimer: NodeJS.Timeout | null = null;
  let lastSweep = 0;
  let tickInFlight: Promise<void> | null = null;

  async function tick(): Promise<void> {
    const tickStart = performance.now();
    let tickOutcome: 'ok' | 'error' = 'ok';
    try {
      const result = await service.processBatch();
      recordEventsProcessed(result.events);
      recordSend('success', result.sent);
      recordSend('permanent_fail', result.permanentFailures);
      recordSend('transient_fail', result.transientFailures);
      if (result.events > 0 || result.sent > 0) {
        log.info(
          `[dispatcher] tick events=${result.events} sent=${result.sent} permanent=${result.permanentFailures} transient=${result.transientFailures} advanced=${result.advanced}`,
        );
      }
      if (result.advanced) {
        const cursor = await service.readCursor();
        setCursorLastBlock(cursor?.lastBlock ?? null);
      }
    } catch (err) {
      tickOutcome = 'error';
      log.error('[dispatcher] tick failed:', err);
    } finally {
      recordTick(tickOutcome, (performance.now() - tickStart) / 1000);
    }

    const now = Date.now();
    if (now - lastSweep >= options.retentionSweepIntervalMs) {
      lastSweep = now;
      try {
        const swept = await service.runRetentionSweep();
        recordRetentionSwept(swept.deleted);
        if (swept.deleted > 0) {
          log.info(
            `[dispatcher] retention swept ${swept.deleted} rows in ${swept.iterations} iterations`,
          );
        }
      } catch (err) {
        log.error('[dispatcher] retention sweep failed:', err);
      }
    }
  }

  function schedule(): void {
    if (stopped) return;
    const delay = withJitter(options.pollIntervalMs, rng);
    currentTimer = setTimeout(() => {
      currentTimer = null;
      tickInFlight = tick().finally(() => {
        tickInFlight = null;
        schedule();
      });
    }, delay);
  }

  void service
    .initialiseCursorIfMissing()
    .then(async () => {
      // Seed the cursor gauge so `/metrics` has a value before the first tick.
      const cursor = await service.readCursor();
      setCursorLastBlock(cursor?.lastBlock ?? null);
      log.info('[dispatcher] loop started');
      schedule();
    })
    .catch((err) => {
      log.error('[dispatcher] initialisation failed:', err);
    });

  return {
    async stop() {
      stopped = true;
      if (currentTimer) {
        clearTimeout(currentTimer);
        currentTimer = null;
      }
      if (tickInFlight) {
        await tickInFlight.catch(() => undefined);
      }
      log.info('[dispatcher] loop stopped');
    },
  };
}
