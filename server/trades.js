import { HttpError } from './http.js';
import { removeUploads } from './screenshots.js';

const COLS = [
  'account_id', 'ticket', 'symbol', 'direction', 'lot', 'entry_price', 'sl', 'tp', 'exit_price',
  'open_time_utc', 'close_time_utc', 'profit', 'commission', 'swap', 'strategy_id',
  'checklist_done', 'tags', 'emotion', 'notes', 'source',
];

const toNum = (v) => (v === '' || v == null ? null : Number(v));
const isoTime = (v) => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null);

export const tagList = (v) => [...new Set((Array.isArray(v) ? v : String(v ?? '').split(','))
  .map((t) => String(t).trim()).filter(Boolean))];

// Validates and normalises a trade payload. Throws HttpError(400) with Thai messages.
export function cleanTrade(db, b = {}) {
  const errors = [];
  const check = (ok, msg) => { if (!ok) errors.push(msg); };

  const symbol = String(b.symbol ?? '').trim().toUpperCase();
  check(/^[A-Z0-9._#-]{2,20}$/.test(symbol), 'กรอกชื่อคู่เงินให้ถูกต้อง เช่น EURUSD');
  check(b.direction === 'buy' || b.direction === 'sell', 'เลือกทิศทาง Buy หรือ Sell');

  const field = (key, label, { required = false, positive = false, fallback = null } = {}) => {
    const v = toNum(b[key]);
    if (v === null) {
      check(!required, `กรอก${label}`);
      return fallback;
    }
    check(Number.isFinite(v), `${label}ต้องเป็นตัวเลข`);
    check(!positive || v > 0, `${label}ต้องมากกว่า 0`);
    return v;
  };
  const lot = field('lot', 'ขนาด lot', { required: true, positive: true });
  const entry_price = field('entry_price', 'ราคาเข้า', { required: true, positive: true });
  // a trade is open while its result (exit price, close time, profit) is left empty; once any is filled all are needed
  const filled = (v) => v !== '' && v != null;
  const closing = [b.exit_price, b.close_time_utc, b.profit].some(filled);
  if (closing && ![b.exit_price, b.close_time_utc, b.profit].every(filled)) {
    errors.push('ไม้ที่ปิดแล้วต้องกรอก ราคาออก เวลาปิด และกำไร/ขาดทุน ให้ครบ (ยังไม่ปิดไม้: เว้นว่างทั้งสามช่อง)');
  }
  const exit_price = field('exit_price', 'ราคาออก', { positive: true });
  const profit = field('profit', 'กำไร/ขาดทุน');
  const sl = field('sl', 'SL', { positive: true });
  const tp = field('tp', 'TP', { positive: true });
  const commission = field('commission', 'Commission', { fallback: 0 });
  const swap = field('swap', 'Swap', { fallback: 0 });

  const open_time_utc = isoTime(b.open_time_utc);
  const close_time_utc = filled(b.close_time_utc) ? isoTime(b.close_time_utc) : null;
  check(open_time_utc, 'กรอกเวลาเปิดให้ถูกต้อง');
  check(!filled(b.close_time_utc) || close_time_utc, 'กรอกเวลาปิดให้ถูกต้อง');
  check(!open_time_utc || !close_time_utc || close_time_utc >= open_time_utc, 'เวลาปิดต้องไม่ก่อนเวลาเปิด');

  const account_id = Number(b.account_id);
  check(db.prepare('SELECT 1 FROM accounts WHERE id = ?').get(account_id), 'ไม่พบบัญชีนี้');

  const strategy_id = toNum(b.strategy_id);
  check(strategy_id === null || db.prepare('SELECT 1 FROM strategies WHERE id = ?').get(strategy_id), 'ไม่พบกลยุทธ์นี้');

  const done = b.checklist_done ?? [];
  check(Array.isArray(done) && done.every((i) => Number.isInteger(i) && i >= 0), 'ข้อมูล checklist ไม่ถูกต้อง');

  const ticket = b.ticket == null || b.ticket === '' ? null : String(b.ticket).trim().slice(0, 40);
  const source = ['manual', 'mt4', 'mt5'].includes(b.source) ? b.source : 'manual';

  if (errors.length) throw new HttpError(400, errors.join(' / '));
  return {
    account_id, ticket, symbol, direction: b.direction, lot, entry_price, sl, tp, exit_price,
    open_time_utc, close_time_utc, profit, commission, swap, strategy_id,
    checklist_done: JSON.stringify(done),
    tags: tagList(b.tags).join(','),
    emotion: String(b.emotion ?? '').trim().slice(0, 40),
    notes: String(b.notes ?? '').slice(0, 5000),
    source,
  };
}

const present = (row, shots = []) => ({
  ...row,
  checklist_done: JSON.parse(row.checklist_done),
  tags: row.tags ? row.tags.split(',') : [],
  screenshots: shots,
});

export function getTrade(db, id) {
  const row = db.prepare('SELECT * FROM trades WHERE id = ?').get(id);
  if (!row) throw new HttpError(404, 'ไม่พบเทรดนี้');
  return present(row, db.prepare('SELECT * FROM screenshots WHERE trade_id = ? ORDER BY id').all(id));
}

export function listTrades(db, accountId) {
  const where = accountId ? 'WHERE account_id = ?' : '';
  const args = accountId ? [accountId] : [];
  const rows = db.prepare(`SELECT * FROM trades ${where} ORDER BY open_time_utc DESC, id DESC`).all(...args);
  const shots = db.prepare(
    `SELECT s.* FROM screenshots s JOIN trades t ON t.id = s.trade_id ${where.replace('account_id', 't.account_id')} ORDER BY s.id`,
  ).all(...args);
  const byTrade = Map.groupBy(shots, (s) => s.trade_id);
  return rows.map((r) => present(r, byTrade.get(r.id)));
}

function writeTrade(row, run) {
  try {
    return run();
  } catch (err) {
    if (/UNIQUE/.test(err.message)) throw new HttpError(400, `Ticket ${row.ticket} มีอยู่แล้วในบัญชีนี้`);
    throw err;
  }
}

export function insertTrade(db, row) {
  const sql = `INSERT INTO trades (${COLS.join(',')}) VALUES (${COLS.map((c) => ':' + c).join(',')})`;
  return writeTrade(row, () => Number(db.prepare(sql).run(row).lastInsertRowid));
}

// Partial update: fields missing from the body keep their stored value.
export function updateTrade(db, id, body) {
  const row = cleanTrade(db, { ...getTrade(db, id), ...body });
  const sql = `UPDATE trades SET ${COLS.map((c) => `${c} = :${c}`).join(',')} WHERE id = :id`;
  writeTrade(row, () => db.prepare(sql).run({ ...row, id }));
  return getTrade(db, id);
}

// Bulk import (MT4/MT5 reports). Everything is validated first, then inserted in one transaction;
// tickets that already exist in the account are skipped so the same file can be imported twice.
export function importTrades(db, body) {
  const list = body?.trades;
  if (!Array.isArray(list) || !list.length) throw new HttpError(400, 'ไม่มีเทรดให้นำเข้า');
  if (list.length > 5000) throw new HttpError(400, 'นำเข้าได้ครั้งละไม่เกิน 5,000 ไม้');
  if (!db.prepare('SELECT 1 FROM accounts WHERE id = ?').get(Number(body.account_id))) throw new HttpError(400, 'ไม่พบบัญชีนี้');

  const rows = list.map((t, i) => {
    if (!String(t?.ticket ?? '').trim()) throw new HttpError(400, `แถวที่ ${i + 1} ไม่มี ticket`);
    try {
      return cleanTrade(db, { ...t, account_id: body.account_id });
    } catch (err) {
      throw err instanceof HttpError ? new HttpError(400, `Ticket ${t.ticket}: ${err.message}`) : err;
    }
  });

  const seen = new Set(db.prepare('SELECT ticket FROM trades WHERE account_id = ? AND ticket IS NOT NULL').all(Number(body.account_id)).map((r) => r.ticket));
  let inserted = 0;
  db.exec('BEGIN');
  try {
    for (const row of rows) {
      if (seen.has(row.ticket)) continue;
      seen.add(row.ticket);
      insertTrade(db, row);
      inserted++;
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return { inserted, skipped: rows.length - inserted };
}

export function tradeRoutes(db, dataDir) {
  return [
    ['GET', '/api/trades', ({ query }) => listTrades(db, Number(query.get('account_id')) || null)],
    ['POST', '/api/trades', ({ body }) => getTrade(db, insertTrade(db, cleanTrade(db, body)))],
    ['POST', '/api/trades/import', ({ body }) => importTrades(db, body)],
    ['PUT', '/api/trades/:id', ({ params, body }) => updateTrade(db, Number(params.id), body ?? {})],
    ['DELETE', '/api/trades/:id', ({ params }) => {
      const trade = getTrade(db, Number(params.id)); // 404 if missing
      db.prepare('DELETE FROM trades WHERE id = ?').run(trade.id); // screenshot rows cascade
      removeUploads(dataDir, trade.screenshots.map((x) => x.filename));
      return {};
    }],
  ];
}
