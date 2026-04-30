import { serve } from '@hono/node-server';
import { SUPPORTED_CHAINS } from '@setcode/shared';
import { createBot } from './bot/index.js';
import { createDatabase } from './db/client.js';
import { startDispatcherLoop } from './dispatcher/loop.js';
import { createHttpApp } from './http/server.js';
import {
  alertRetentionDays,
  chainRpcUrls,
  confirmationTtlSeconds,
  corsOrigins,
  dispatchBatchSize,
  httpPort,
  maxSubscriptionsPerChat,
  pollIntervalMs,
  requireBotUsername,
  requireTelegramToken,
  retentionSweepBatchSize,
  retentionSweepIntervalMs,
  webBaseUrl,
} from './lib/env.js';
import { startDefaultMetrics } from './lib/metrics.js';
import { createCheckService } from './services/check.js';
import { createClassificationService } from './services/classification.js';
import { createConfirmationsService } from './services/confirmations.js';
import { createDispatcherService } from './services/dispatcher.js';
import { createManageService } from './services/manage.js';
import { createRegistryService } from './services/registry.js';
import { createTelegramClient } from './telegram/client.js';

async function main() {
  const token = requireTelegramToken();
  const botUsername = requireBotUsername();

  // Process-level metrics (event loop lag, heap, GC). Opt-in here so vitest
  // cases that import the metrics module don't hook the real process.
  startDefaultMetrics();

  const db = createDatabase();
  const service = createConfirmationsService(db, {
    confirmationTtlSeconds: confirmationTtlSeconds(),
    maxSubscriptionsPerChat: maxSubscriptionsPerChat(),
  });

  const manageService = createManageService(db, { webBaseUrl: webBaseUrl() });

  const classification = createClassificationService(db);
  // Per-chain RPC URLs for the CheckService's live-state fallback. The
  // indexer reads the same env keys; we just consume them here too so a
  // single configuration drives both. Missing entries are no-ops on the
  // fallback path — existing "Not Detected" behaviour is preserved.
  const rpcUrls = chainRpcUrls(SUPPORTED_CHAINS);
  for (const chain of SUPPORTED_CHAINS) {
    const have = rpcUrls.has(chain.id) ? '✓' : '✗';
    console.log(`[setcode/watcher] live-fallback RPC ${chain.shortName}: ${have}`);
  }
  const checkService = createCheckService(db, { classification, rpcUrls });

  const bot = createBot({ token, service, manage: manageService, check: checkService });
  const registryService = createRegistryService(db);
  const app = createHttpApp({
    service,
    checkService,
    manageService,
    registryService,
    botUsername,
    corsOrigins: corsOrigins(),
    // Tell /check which chains it can reach. Includes the 4 indexed
    // chains AND every public RPC we hardcode in public-rpcs.ts.
    liveCheckableChainIds: Array.from(rpcUrls.keys()),
  });
  const telegram = createTelegramClient(token);
  const dispatcher = createDispatcherService(
    { db, telegram, classification },
    {
      batchSize: dispatchBatchSize(),
      retentionDays: alertRetentionDays(),
      retentionBatchSize: retentionSweepBatchSize(),
    },
  );

  const port = httpPort();
  const httpServer = serve({ fetch: app.fetch, port });
  console.log(`[setcode/watcher] HTTP listening on :${port}`);

  await bot.launch();
  console.log(`[setcode/watcher] bot @${botUsername} running`);

  const loop = startDispatcherLoop(dispatcher, {
    pollIntervalMs: pollIntervalMs(),
    retentionSweepIntervalMs: retentionSweepIntervalMs(),
  });

  const shutdown = async (signal: string) => {
    console.log(`[setcode/watcher] ${signal} received, shutting down…`);
    await loop.stop();
    bot.stop(signal);
    httpServer.close();
    await db.close();
    process.exit(0);
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[setcode/watcher] fatal:', err);
  process.exit(1);
});
