import { serve } from '@hono/node-server';
import { createBot } from './bot/index.js';
import { createDatabase } from './db/client.js';
import { createHttpApp } from './http/server.js';
import {
  confirmationTtlSeconds,
  corsOrigins,
  httpPort,
  maxSubscriptionsPerChat,
  requireBotUsername,
  requireTelegramToken,
} from './lib/env.js';
import { createConfirmationsService } from './services/confirmations.js';

async function main() {
  const token = requireTelegramToken();
  const botUsername = requireBotUsername();

  const db = createDatabase();
  const service = createConfirmationsService(db, {
    confirmationTtlSeconds: confirmationTtlSeconds(),
    maxSubscriptionsPerChat: maxSubscriptionsPerChat(),
  });

  const bot = createBot({ token, service });
  const app = createHttpApp({ service, botUsername, corsOrigins: corsOrigins() });

  const port = httpPort();
  const httpServer = serve({ fetch: app.fetch, port });
  console.log(`[setcode/watcher] HTTP listening on :${port}`);

  await bot.launch();
  console.log(`[setcode/watcher] bot @${botUsername} running`);

  const shutdown = async (signal: string) => {
    console.log(`[setcode/watcher] ${signal} received, shutting down…`);
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
