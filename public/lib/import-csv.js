// Reads the trade list written by `python research/baseline.py --export file.csv`.
// Pure function (no DOM) so it runs in the browser and under node:test.

export const CSV_HEADER = 'ticket,symbol,direction,lot,entry_price,initial_sl,exit_price,open_time_utc,close_time_utc,profit,swap,commission,risk_amount,strategy';
const COLS = CSV_HEADER.split(',');
const NUMS = ['lot', 'entry_price', 'initial_sl', 'exit_price', 'profit', 'swap', 'commission', 'risk_amount'];

// One CSV line -> cells. Handles "quoted, cells" and "" escapes; no multi-line cells.
function cells(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted && ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
    else if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

// -> { trades, errors, warnings }. A bad row is reported and left out; nothing is guessed.
export function parseBacktestCsv(text, strategies) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines[0]?.trim() !== CSV_HEADER) throw new Error(`หัวตารางไม่ตรง — ใช้ไฟล์จาก research/baseline.py --export ที่ขึ้นต้นด้วย ${CSV_HEADER}`);
  const trades = [];
  const errors = [];
  const warnings = [];
  lines.slice(1).forEach((line, i) => {
    const c = cells(line);
    const row = Object.fromEntries(COLS.map((k, j) => [k, (c[j] ?? '').trim()]));
    const where = `แถว ${i + 2} (${row.ticket || 'ไม่มี ticket'})`;
    const bad = [
      c.length !== COLS.length && `มี ${c.length} คอลัมน์ ต้องมี ${COLS.length}`,
      !row.ticket && 'ไม่มี ticket',
      !['buy', 'sell'].includes(row.direction) && 'direction ต้องเป็น buy หรือ sell',
      ...NUMS.filter((k) => row[k] === '' || !Number.isFinite(Number(row[k]))).map((k) => `${k} ไม่ใช่ตัวเลข`),
      ...['open_time_utc', 'close_time_utc'].filter((k) => !Number.isFinite(Date.parse(row[k]))).map((k) => `${k} ไม่ใช่เวลา`),
    ].filter(Boolean);
    if (bad.length) { errors.push(`${where}: ${bad.join(', ')}`); return; }
    const strategy = strategies.find((st) => st.name === row.strategy);
    if (!strategy) warnings.push(`${where}: ไม่พบกลยุทธ์ "${row.strategy}" — นำเข้าแบบไม่ระบุกลยุทธ์`);
    const n = Object.fromEntries(NUMS.map((k) => [k, Number(row[k])]));
    trades.push({
      ...n, ticket: row.ticket, symbol: row.symbol, direction: row.direction, sl: n.initial_sl,
      open_time_utc: new Date(row.open_time_utc).toISOString(), close_time_utc: new Date(row.close_time_utc).toISOString(),
      strategy_id: strategy?.id ?? null, source: 'csv-backtest',
    });
  });
  return { trades, errors, warnings };
}
