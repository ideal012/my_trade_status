import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

// exit_price / close_time_utc / profit are NULL while a trade is still open.
const tradesTable = (name) => `
CREATE TABLE IF NOT EXISTS ${name} (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  ticket TEXT,
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('buy', 'sell')),
  lot REAL NOT NULL,
  entry_price REAL NOT NULL,
  sl REAL,
  tp REAL,
  exit_price REAL,
  open_time_utc TEXT NOT NULL,
  close_time_utc TEXT,
  profit REAL,
  commission REAL NOT NULL DEFAULT 0,
  swap REAL NOT NULL DEFAULT 0,
  strategy_id INTEGER REFERENCES strategies(id),
  checklist_done TEXT NOT NULL DEFAULT '[]',
  tags TEXT NOT NULL DEFAULT '',
  emotion TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  risk_amount REAL,
  initial_sl REAL,
  UNIQUE (account_id, ticket)
);`;

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
${tradesTable('trades')}
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

// 'YYYYMMDD-HHmmss' (UTC) for backup file names
export const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

const V0_COLUMNS = 'id, account_id, ticket, symbol, direction, lot, entry_price, sl, tp, exit_price, open_time_utc, close_time_utc, '
  + 'profit, commission, swap, strategy_id, checklist_done, tags, emotion, notes, source, created_at';

// Schema changes for databases created by older versions. PRAGMA user_version records what was applied.
function migrate(db, file) {
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version < 1) toV1(db, file);
  if (version < 2) {
    // v2: money at risk typed by the user (optional)
    if (!db.prepare('PRAGMA table_info(trades)').all().some((c) => c.name === 'risk_amount')) {
      db.exec('ALTER TABLE trades ADD COLUMN risk_amount REAL');
    }
    db.exec('PRAGMA user_version = 2');
  }
  if (version < 3) {
    // v3: SL at entry, so R stays right after the SL is trailed (optional)
    if (!db.prepare('PRAGMA table_info(trades)').all().some((c) => c.name === 'initial_sl')) {
      db.exec('ALTER TABLE trades ADD COLUMN initial_sl REAL');
    }
    db.exec('PRAGMA user_version = 3');
  }
}

function toV1(db, file) {
  // v1: allow open trades. SQLite cannot drop NOT NULL in place, so the table is rebuilt
  // (the documented 12-step procedure) after a copy of the whole database is saved.
  const exitCol = db.prepare('PRAGMA table_info(trades)').all().find((c) => c.name === 'exit_price');
  if (!exitCol.notnull) {
    db.exec('PRAGMA user_version = 1');
    return;
  }
  if (file !== ':memory:') {
    mkdirSync(join(dirname(file), 'backups'), { recursive: true });
    db.prepare('VACUUM INTO ?').run(join(dirname(file), 'backups', `before-update-${stamp()}.db`));
  }
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN');
  try {
    db.exec(tradesTable('trades_new'));
    db.exec(`INSERT INTO trades_new (${V0_COLUMNS}) SELECT ${V0_COLUMNS} FROM trades`);
    db.exec('DROP TABLE trades');
    db.exec('ALTER TABLE trades_new RENAME TO trades');
    db.exec('CREATE INDEX IF NOT EXISTS trades_account_time ON trades (account_id, open_time_utc)');
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('foreign key check failed during migration');
    db.exec('PRAGMA user_version = 1');
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA);
  migrate(db, file);
  if (!db.prepare('SELECT 1 FROM accounts LIMIT 1').get()) {
    db.prepare("INSERT INTO accounts (name, currency, initial_capital) VALUES ('บัญชีหลัก', 'USD', 1000)").run();
  }
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('timezone', 'Asia/Bangkok')").run();
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('max_risk_pct', '2')").run();
  return db;
}
