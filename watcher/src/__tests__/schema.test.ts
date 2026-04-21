import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const MIGRATIONS_DIR = join(process.cwd(), 'migrations');

function loadMigrationSql(): string {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  return files.map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf8')).join('\n');
}

async function freshDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(loadMigrationSql());
  return db;
}

const ADDR_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ADDR_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const TX_HASH = `0x${'c'.repeat(64)}`;

describe('watcher schema migration', () => {
  let db: PGlite;

  beforeEach(async () => {
    db = await freshDb();
  });

  afterEach(async () => {
    await db.close();
  });

  it('creates all expected tables', async () => {
    const { rows } = await db.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
    );
    expect(rows.map((r) => r.table_name).filter((n) => !n.startsWith('__'))).toEqual([
      'alerts_sent',
      'dispatcher_cursor',
      'manage_tokens',
      'pending_confirmations',
      'subscriptions',
    ]);
  });

  it('enforces UNIQUE(eoa, telegram_chat_id) on subscriptions', async () => {
    await db.query(`INSERT INTO subscriptions (eoa, telegram_chat_id) VALUES ('${ADDR_A}', 42)`);
    await expect(
      db.query(`INSERT INTO subscriptions (eoa, telegram_chat_id) VALUES ('${ADDR_A}', 42)`),
    ).rejects.toThrow();
  });

  it('permits same EOA in different chats (many-to-many)', async () => {
    await db.query(
      `INSERT INTO subscriptions (eoa, telegram_chat_id) VALUES ('${ADDR_A}', 1), ('${ADDR_A}', 2)`,
    );
    const { rows } = await db.query<{ n: string }>('SELECT COUNT(*)::int AS n FROM subscriptions');
    expect(Number(rows[0]?.n)).toBe(2);
  });

  it('permits same chat subscribing to different EOAs (many-to-many)', async () => {
    await db.query(
      `INSERT INTO subscriptions (eoa, telegram_chat_id) VALUES ('${ADDR_A}', 1), ('${ADDR_B}', 1)`,
    );
    const { rows } = await db.query<{ n: string }>('SELECT COUNT(*)::int AS n FROM subscriptions');
    expect(Number(rows[0]?.n)).toBe(2);
  });

  it('rejects uppercase hex via regex CHECK on eoa', async () => {
    await expect(
      db.query(
        `INSERT INTO subscriptions (eoa, telegram_chat_id) VALUES ('0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 1)`,
      ),
    ).rejects.toThrow();
  });

  it('rejects invalid classification values in alerts_sent', async () => {
    await expect(
      db.query(
        `INSERT INTO alerts_sent (eoa, telegram_chat_id, tx_hash, old_classification, new_classification, chain_id, block_number)
         VALUES ('${ADDR_A}', 1, '${TX_HASH}', 'unknown', 'bogus', 1, 100)`,
      ),
    ).rejects.toThrow();
  });

  it('enforces UNIQUE(tx_hash, telegram_chat_id) on alerts_sent for idempotency', async () => {
    await db.query(
      `INSERT INTO alerts_sent (eoa, telegram_chat_id, tx_hash, old_classification, new_classification, chain_id, block_number)
       VALUES ('${ADDR_A}', 1, '${TX_HASH}', 'unknown', 'malicious', 1, 100)`,
    );
    await expect(
      db.query(
        `INSERT INTO alerts_sent (eoa, telegram_chat_id, tx_hash, old_classification, new_classification, chain_id, block_number)
         VALUES ('${ADDR_A}', 1, '${TX_HASH}', 'unknown', 'malicious', 1, 100)`,
      ),
    ).rejects.toThrow();
  });

  it('permits same tx_hash for a different chat (per-chat idempotency)', async () => {
    await db.query(
      `INSERT INTO alerts_sent (eoa, telegram_chat_id, tx_hash, old_classification, new_classification, chain_id, block_number)
       VALUES ('${ADDR_A}', 1, '${TX_HASH}', 'unknown', 'malicious', 1, 100),
              ('${ADDR_A}', 2, '${TX_HASH}', 'unknown', 'malicious', 1, 100)`,
    );
    const { rows } = await db.query<{ n: string }>('SELECT COUNT(*)::int AS n FROM alerts_sent');
    expect(Number(rows[0]?.n)).toBe(2);
  });

  it('rejects pending_confirmations with a malformed EOA', async () => {
    await expect(
      db.query(
        `INSERT INTO pending_confirmations (code, eoa, expires_at)
         VALUES ('abc', '0xnothex', NOW() + INTERVAL '5 minutes')`,
      ),
    ).rejects.toThrow();
  });

  it('stores manage_tokens with optional revoked_at', async () => {
    await db.query(`INSERT INTO manage_tokens (token, telegram_chat_id) VALUES ('tok-1', 42)`);
    const { rows } = await db.query<{ token: string; revoked_at: string | null }>(
      'SELECT token, revoked_at FROM manage_tokens',
    );
    expect(rows[0]?.token).toBe('tok-1');
    expect(rows[0]?.revoked_at).toBeNull();
  });
});
