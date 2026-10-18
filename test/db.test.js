import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../server/db.js';

// The trades table as shipped in the first release (closing fields NOT NULL, no user_version).
const V0 = `
CREATE TABLE accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'USD', initial_capital REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE strategies (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', checklist TEXT NOT NULL DEFAULT '[]', archived INTEGER NOT NULL DEFAULT 0);
CREATE TABLE trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL REFERENCES accounts(id), ticket TEXT, symbol TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('buy', 'sell')), lot REAL NOT NULL, entry_price REAL NOT NULL, sl REAL, tp REAL,
  exit_price REAL NOT NULL, open_time_utc TEXT NOT NULL, close_time_utc TEXT NOT NULL, profit REAL NOT NULL,
  commission REAL NOT NULL DEFAULT 0, swap REAL NOT NULL DEFAULT 0, strategy_id INTEGER REFERENCES strategies(id),
  checklist_done TEXT NOT NULL DEFAULT '[]', tags TEXT NOT NULL DEFAULT '', emotion TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual', created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (account_id, ticket));
CREATE INDEX trades_account_time ON trades (account_id, open_time_utc);
CREATE TABLE screenshots (id INTEGER PRIMARY KEY AUTOINCREMENT, trade_id INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE, filename TEXT NOT NULL, caption TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO accounts (name, initial_capital) VALUES ('Real', 5000);
INSERT INTO settings VALUES ('timezone', 'Europe/London');
INSERT INTO trades (account_id, ticket, symbol, direction, lot, entry_price, sl, tp, exit_price, open_time_utc, close_time_utc, profit, tags)
  VALUES (1, '9', 'EURUSD', 'buy', 0.1, 1.1, 1.09, 1.12, 1.11, '2024-01-01T00:00:00.000Z', '2024-01-01T01:00:00.000Z', 100, 'a,b');
INSERT INTO screenshots (trade_id, filename) VALUES (1, 'x.png');
`;

test('a first-release database is backed up and migrated without losing data', () => {
  const dir = mkdtempSync(join(tmpdir(), 'journal-mig-'));
  const file = join(dir, 'journal.db');
  const old = new DatabaseSync(file);
  old.exec(V0);
  old.close();

  const db = openDb(file);
  try {
    const t = db.prepare('SELECT * FROM trades').get();
    assert.equal(t.ticket, '9');
    assert.equal(t.profit, 100);
    assert.equal(t.tags, 'a,b');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM screenshots WHERE trade_id = 1').get().n, 1);
    assert.equal(db.prepare('SELECT initial_capital FROM accounts').get().initial_capital, 5000);
    assert.equal(db.prepare("SELECT value FROM settings WHERE key = 'timezone'").get().value, 'Europe/London');

    // closing fields are optional now (open trades)
    const cols = Object.fromEntries(db.prepare('PRAGMA table_info(trades)').all().map((c) => [c.name, c]));
    for (const c of ['exit_price', 'close_time_utc', 'profit']) assert.equal(cols[c].notnull, 0, c);
    db.prepare("INSERT INTO trades (account_id, symbol, direction, lot, entry_price, open_time_utc) VALUES (1, 'GBPUSD', 'sell', 1, 1.3, '2024-02-01T00:00:00.000Z')").run();

    // foreign keys still hold after the rebuild
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    db.prepare('DELETE FROM trades WHERE id = 1').run();
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM screenshots').get().n, 0); // cascade works

    const backups = readdirSync(join(dir, 'backups'));
    assert.equal(backups.length, 1);
    assert.match(backups[0], /^before-update-\d{8}-\d{6}\.db$/);
    const copy = new DatabaseSync(join(dir, 'backups', backups[0]), { readOnly: true });
    assert.equal(copy.prepare('SELECT COUNT(*) AS n FROM trades').get().n, 1);
    copy.close();
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('opening an up-to-date database again does not back up or migrate', () => {
  const dir = mkdtempSync(join(tmpdir(), 'journal-mig-'));
  const file = join(dir, 'journal.db');
  openDb(file).close();
  openDb(file).close();
  assert.throws(() => readdirSync(join(dir, 'backups')));
  rmSync(dir, { recursive: true, force: true });
});
