import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  initial_capital REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS strategies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  checklist TEXT NOT NULL DEFAULT '[]',
  archived INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  ticket TEXT,
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('buy', 'sell')),
  lot REAL NOT NULL,
  entry_price REAL NOT NULL,
  sl REAL,
  tp REAL,
  exit_price REAL NOT NULL,
  open_time_utc TEXT NOT NULL,
  close_time_utc TEXT NOT NULL,
  profit REAL NOT NULL,
  commission REAL NOT NULL DEFAULT 0,
  swap REAL NOT NULL DEFAULT 0,
  strategy_id INTEGER REFERENCES strategies(id),
  checklist_done TEXT NOT NULL DEFAULT '[]',
  tags TEXT NOT NULL DEFAULT '',
  emotion TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (account_id, ticket)
);
CREATE INDEX IF NOT EXISTS trades_account_time ON trades (account_id, open_time_utc);
CREATE TABLE IF NOT EXISTS screenshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trade_id INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA);
  if (!db.prepare('SELECT 1 FROM accounts LIMIT 1').get()) {
    db.prepare("INSERT INTO accounts (name, currency, initial_capital) VALUES ('บัญชีหลัก', 'USD', 1000)").run();
  }
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('timezone', 'Asia/Bangkok')").run();
  return db;
}
