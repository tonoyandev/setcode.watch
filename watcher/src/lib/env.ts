export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.length === 0) {
    throw new Error(
      `[setcode/watcher] environment variable ${key} is required but was not set. See watcher/.env.example for the full list.`,
    );
  }
  return value;
}

export function optionalIntEnv(key: string, fallback: number): number {
  const value = process.env[key];
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `[setcode/watcher] environment variable ${key}=${value} must be a positive integer.`,
    );
  }
  return parsed;
}

export function requireDatabaseUrl(): string {
  return requireEnv('DATABASE_URL');
}

export function confirmationTtlSeconds(): number {
  return optionalIntEnv('CONFIRMATION_TTL_SECONDS', 300);
}

export function alertRetentionDays(): number {
  return optionalIntEnv('ALERT_RETENTION_DAYS', 90);
}

export function maxSubscriptionsPerChat(): number {
  return optionalIntEnv('MAX_SUBSCRIPTIONS_PER_CHAT', 10);
}

export function requireTelegramToken(): string {
  return requireEnv('TELEGRAM_BOT_TOKEN');
}

export function requireBotUsername(): string {
  return requireEnv('TELEGRAM_BOT_USERNAME');
}

export function httpPort(): number {
  return optionalIntEnv('WATCHER_HTTP_PORT', 8787);
}

export function corsOrigins(): string[] {
  const raw = process.env.WATCHER_CORS_ORIGIN ?? 'http://localhost:3000';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function pollIntervalMs(): number {
  return optionalIntEnv('WATCHER_POLL_INTERVAL_MS', 5000);
}

export function dispatchBatchSize(): number {
  return optionalIntEnv('WATCHER_DISPATCH_BATCH_SIZE', 100);
}

// Max new events fanned into alerts per tick. Caps downstream work during
// backlog catch-up so the event loop does not stall.
export function retentionSweepIntervalMs(): number {
  return optionalIntEnv('WATCHER_RETENTION_SWEEP_INTERVAL_MS', 60 * 60 * 1000);
}

export function retentionSweepBatchSize(): number {
  return optionalIntEnv('WATCHER_RETENTION_SWEEP_BATCH_SIZE', 10000);
}
