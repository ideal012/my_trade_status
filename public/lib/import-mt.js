// Parser for MetaTrader report files saved as HTML:
//  - MT5: History tab -> right click -> Report -> HTML (uses the "Positions" table)
//  - MT4: Account History tab -> right click -> Save as Detailed Report (uses "Closed Transactions")
// Pure text processing (no DOM) so it runs in the browser and under node:test.
// Columns are found by header name, so different broker layouts still work; rows that cannot be
// read are reported in `errors` instead of being guessed.

const DATE = /^\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}(:\d{2})?$/;
const HOUR = 3600_000;

// ---- time ----

// n-th Sunday of a month (month 0-based) at `hour` UTC
function sundayMs(year, month, nth, hour) {
  const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay();
  return Date.UTC(year, month, 1 + ((7 - firstDow) % 7) + (nth - 1) * 7, hour);
}

// utcOffset: hours as a number, or 'ny' for the usual broker clock (GMT+2, GMT+3 while the US is on DST).
export function serverTimeToUtc(text, utcOffset) {
  const [d, t] = text.split(' ');
  const [y, mo, da] = d.split('.').map(Number);
  const [h, mi, s = 0] = t.split(':').map(Number);
  const wall = Date.UTC(y, mo - 1, da, h, mi, s);
  if (utcOffset !== 'ny') return new Date(wall - Number(utcOffset) * HOUR).toISOString();
  const summer = wall - 3 * HOUR;
  const inDst = summer >= sundayMs(y, 2, 2, 7) && summer < sundayMs(y, 10, 1, 6);
  return new Date(inDst ? summer : wall - 2 * HOUR).toISOString();
}

// ---- file text ----

// MetaTrader saves reports as UTF-16 (usually with BOM); other tools save UTF-8.
export function decodeReport(data) {
  const b = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2));
  if (b[0] !== 0 && b[1] === 0 && b[3] === 0) return new TextDecoder('utf-16le').decode(b);
  return new TextDecoder('utf-8').decode(b);
}

const ENTITIES = { '&nbsp;': ' ', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'" };
const cleanText = (s) => s
  .replace(/<[^>]*>/g, '')
  .replace(/&(nbsp|lt|gt|quot|apos|#39);/g, (m) => ENTITIES[m])
  .replace(/&amp;/g, '&')
  .replace(/[\s ]+/g, ' ')
  .trim();

// Every <tr> as an array of cell texts. A cell with colspan=n is followed by n-1 empty cells so
// columns keep their positions. Splitting on the next opening tag copes with missing </td>.
function readRows(html) {
  return html.split(/<tr\b/i).slice(1).map((tr) => tr.split(/<t[dh]\b/i).slice(1).flatMap((td) => {
    const gt = td.indexOf('>');
    const span = Number(/colspan\s*=\s*["']?(\d+)/i.exec(td.slice(0, gt))?.[1] ?? 1);
    return [cleanText(td.slice(gt + 1)), ...Array(span - 1).fill('')];
  }));
}

// ---- table headers ----

const norm = (s) => s.toLowerCase().replace(/[\s_]/g, '');
const all = (names, name) => names.flatMap((n, i) => (n === name ? [i] : []));
const first = (names, ...opts) => opts.map((o) => names.indexOf(o)).find((i) => i >= 0) ?? -1;

function detectHeader(names) {
  const has = (...n) => n.every((x) => names.includes(x));
  if (has('position', 'symbol', 'volume', 'profit', 's/l', 't/p')) {
    return {
      kind: 'mt5', time: all(names, 'time'), price: all(names, 'price'),
      ticket: names.indexOf('position'), symbol: names.indexOf('symbol'), type: names.indexOf('type'), lot: names.indexOf('volume'),
      sl: names.indexOf('s/l'), tp: names.indexOf('t/p'),
      commission: names.indexOf('commission'), fee: names.indexOf('fee'), swap: names.indexOf('swap'), profit: names.indexOf('profit'),
    };
  }
  if (has('ticket', 'opentime', 'profit') && first(names, 'item', 'symbol') >= 0) {
    const price = all(names, 'price');
    return {
      kind: 'mt4', time: [names.indexOf('opentime'), price[1] - 1], price,
      ticket: names.indexOf('ticket'), symbol: first(names, 'item', 'symbol'), type: names.indexOf('type'), lot: first(names, 'size', 'volume'),
      sl: names.indexOf('s/l'), tp: names.indexOf('t/p'),
      commission: names.indexOf('commission'), fee: names.indexOf('taxes'), swap: names.indexOf('swap'), profit: names.indexOf('profit'),
    };
  }
  return null;
}

// header of some other table (Orders, Deals, Working Orders...) or a section title: ends the current table
const isOtherHeader = (names) => (names.includes('symbol') || names.includes('item')) && names.includes('type');
const isTitleRow = (cells) => new Set(cells.filter(Boolean)).size === 1 && !DATE.test(cells.find(Boolean));

// ---- rows ----

const toNumber = (s) => (s === '' || s == null ? null : Number(String(s).replace(/[\s,]/g, '').replace(/−/g, '-')));

function readTrade(cells, h, source, utcOffset) {
  const [openText, closeText] = h.time.map((i) => cells[i] ?? '');
  if (!DATE.test(openText) || !DATE.test(closeText)) return null; // open position, summary line...
  const ticket = cells[h.ticket];
  const direction = (cells[h.type] ?? '').toLowerCase();
  if (!/^\d+$/.test(ticket ?? '') || (direction !== 'buy' && direction !== 'sell')) return null; // balance, pending orders...

  const bad = [];
  const num = (label, i, { optional = false, zeroIsNone = false } = {}) => {
    const raw = i >= 0 ? cells[i] : '';
    const n = toNumber(raw);
    if (n === null) { if (!optional) bad.push(`${label} ว่าง`); return null; }
    if (!Number.isFinite(n)) { bad.push(`${label} "${raw}" ไม่ใช่ตัวเลข`); return null; }
    return zeroIsNone && n === 0 ? null : n;
  };
  const trade = {
    ticket,
    symbol: (cells[h.symbol] ?? '').toUpperCase(),
    direction,
    lot: num('Lot', h.lot),
    entry_price: num('ราคาเข้า', h.price[0]),
    sl: num('SL', h.sl, { optional: true, zeroIsNone: true }),
    tp: num('TP', h.tp, { optional: true, zeroIsNone: true }),
    exit_price: num('ราคาออก', h.price[1]),
    open_time_utc: serverTimeToUtc(openText, utcOffset),
    close_time_utc: serverTimeToUtc(closeText, utcOffset),
    profit: num('Profit', h.profit),
    commission: (num('Commission', h.commission, { optional: true }) ?? 0) + (num('Fee/Tax', h.fee, { optional: true }) ?? 0),
    swap: num('Swap', h.swap, { optional: true }) ?? 0,
    source,
  };
  if (!trade.symbol) bad.push('ไม่มีชื่อคู่เงิน');
  return bad.length ? { error: `Ticket ${ticket}: ${bad.join(', ')}` } : { trade };
}

export function parseReport(text, utcOffset) {
  const trades = [];
  const errors = [];
  let kind = null;
  let header = null;
  for (const cells of readRows(String(text))) {
    const names = cells.map(norm);
    const found = detectHeader(names);
    if (found) {
      header = found;
      kind ??= found.kind;
    } else if (isOtherHeader(names) || isTitleRow(cells)) {
      header = null;
    } else if (header) {
      const row = readTrade(cells, header, header.kind, utcOffset);
      if (row?.trade) trades.push(row.trade);
      if (row?.error) errors.push(row.error);
    }
  }
  if (!kind) throw new Error('ไม่พบตารางเทรดของ MT4/MT5 ในไฟล์นี้ — ใช้ไฟล์ HTML ที่ได้จาก History → คลิกขวา → Report (MT5) หรือ Save as Detailed Report (MT4)');
  return { kind, trades, errors };
}
