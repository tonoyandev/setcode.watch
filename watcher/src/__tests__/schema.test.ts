import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { type IMemoryDb, newDb } from 'pg-mem';
import { beforeEach, describe, expect, it } from 'vitest';

const MIGRATIONS_DIR = join(process.cwd(), 'migrations');

// pg-mem 3.x does not implement Postgres's `~` regex operator. The regex
// CHECK constraints (hex format on eoa / tx_hash / targets) are therefore
// stripped at unit-test load time and instead validated by integration tests
// against a real Postgres service in CI.
function stripRegexChecks(sql: string): string {
  const needle = 'CONSTRAINT "';
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const start = sql.indexOf(needle, i);
    if (start === -1) {
      out += sql.slice(i);
      break;
    }
    const nameEnd = sql.indexOf('"', start + needle.length);
    const parenOpen = sql.indexOf('(', nameEnd);
    let depth = 0;
    let j = parenOpen;
    for (; j < sql.length; j++) {
      const c = sql[j];
      if (c === '(') depth++;
      else if (c === ')') {
        depth--;
        if (depth === 0) {
          j++;
          break;
        }
      }
    }
    const body = sql.slice(parenOpen, j);
    if (body.includes('~')) {
      let before = start;
      while (before > 0) {
        const prev = sql[before - 1];
        if (prev !== ' ' && prev !== '\n' && prev !== '\t' && prev !== ',') break;
        before--;
      }
      const leading = sql.slice(before, start);
      const keepLeading = leading.includes(',') ? '' : leading;
      out += sql.slice(i, before) + keepLeading;
      i = j;
    } else {
      out += sql.slice(i, j);
      i = j;
    }
  }
  return out;
}

function loadMigrationSql(): string {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  return files
    .map((f) => stripRegexChecks(readFileSync(join(MIGRATIONS_DIR, f), 'utf8')))
    .join('\n');
}

function freshDb(): IMemoryDb {
  const db = newDb();
  db.public.none(loadMigrationSql());
  return db;
}

const ADDR_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ADDR_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const TX_HASH = `0x${'c'.repeat(64)}`;

describe('watcher schema migration', () => {
  let db: IMemoryDb;

  beforeEach(() => {
    db = freshDb();
  });

  it('creates all four tables', () => {
    const rows = db.public.many(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
    );
    expect(rows.map((r) => r.table_name)).toEqual([
      'alerts_sent',
      'manage_tokens',
      'pending_confirmations',
      'subscriptions',
    ]);
  });

  it('enforces UNIQUE(eoa, telegram_chat_id) on subscriptions', () => {
    db.public.none(`INSERT INTO subscriptions (eoa, telegram_chat_id) VALUES ('${ADDR_A}', 42)`);
    expect(() =>
      db.public.none(`INSERT INTO subscriptions (eoa, telegram_chat_id) VALUES ('${ADDR_A}', 42)`),
    ).toThrow();
  });

  it('permits same EOA in different chats (many-to-many)', () => {
    db.public.none(
      `INSERT INTO subscriptions (eoa, telegram_chat_id) VALUES ('${ADDR_A}', 1), ('${ADDR_A}', 2)`,
    );
    const count = db.public.one('SELECT COUNT(*)::int AS n FROM subscriptions');
    expect(count.n).toBe(2);
  });

  it('permits same chat subscribing to different EOAs (many-to-many)', () => {
    db.public.none(
      `INSERT INTO subscriptions (eoa, telegram_chat_id) VALUES ('${ADDR_A}', 1), ('${ADDR_B}', 1)`,
    );
    const count = db.public.one('SELECT COUNT(*)::int AS n FROM subscriptions');
    expect(count.n).toBe(2);
  });

  it('rejects invalid classification values in alerts_sent', () => {
    expect(() =>
      db.public.none(
        `INSERT INTO alerts_sent (eoa, telegram_chat_id, tx_hash, old_classification, new_classification, chain_id, block_number)
         VALUES ('${ADDR_A}', 1, '${TX_HASH}', 'unknown', 'bogus', 1, 100)`,
      ),
    ).toThrow();
  });

  it('enforces UNIQUE(tx_hash, telegram_chat_id) on alerts_sent for idempotency', () => {
    db.public.none(
      `INSERT INTO alerts_sent (eoa, telegram_chat_id, tx_hash, old_classification, new_classification, chain_id, block_number)
       VALUES ('${ADDR_A}', 1, '${TX_HASH}', 'unknown', 'malicious', 1, 100)`,
    );
    expect(() =>
      db.public.none(
        `INSERT INTO alerts_sent (eoa, telegram_chat_id, tx_hash, old_classification, new_classification, chain_id, block_number)
         VALUES ('${ADDR_A}', 1, '${TX_HASH}', 'unknown', 'malicious', 1, 100)`,
      ),
    ).toThrow();
  });

  it('permits same tx_hash for a different chat (per-chat idempotency)', () => {
    db.public.none(
      `INSERT INTO alerts_sent (eoa, telegram_chat_id, tx_hash, old_classification, new_classification, chain_id, block_number)
       VALUES ('${ADDR_A}', 1, '${TX_HASH}', 'unknown', 'malicious', 1, 100),
              ('${ADDR_A}', 2, '${TX_HASH}', 'unknown', 'malicious', 1, 100)`,
    );
    const count = db.public.one('SELECT COUNT(*)::int AS n FROM alerts_sent');
    expect(count.n).toBe(2);
  });

  it('stores manage_tokens with optional revoked_at', () => {
    db.public.none(`INSERT INTO manage_tokens (token, telegram_chat_id) VALUES ('tok-1', 42)`);
    const row = db.public.one('SELECT token, revoked_at FROM manage_tokens');
    expect(row.token).toBe('tok-1');
    expect(row.revoked_at).toBeNull();
  });
});
