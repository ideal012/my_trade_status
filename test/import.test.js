import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startTestServer, sampleTrade } from './helpers.js';
import { decodeReport, parseReport, serverTimeToUtc } from '../public/lib/import-mt.js';

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} !~ ${b}`);

test('server time -> UTC: broker GMT+2/+3 follows US daylight saving', () => {
  assert.equal(serverTimeToUtc('2024.01.15 10:30:00', 'ny'), '2024-01-15T08:30:00.000Z'); // winter GMT+2
  assert.equal(serverTimeToUtc('2024.07.15 10:30:00', 'ny'), '2024-07-15T07:30:00.000Z'); // summer GMT+3
  assert.equal(serverTimeToUtc('2024.03.08 10:00:00', 'ny'), '2024-03-08T08:00:00.000Z'); // before US DST starts (10 Mar)
  assert.equal(serverTimeToUtc('2024.03.11 10:00:00', 'ny'), '2024-03-11T07:00:00.000Z');
  assert.equal(serverTimeToUtc('2024.11.05 10:00:00', 'ny'), '2024-11-05T08:00:00.000Z'); // after DST ends (3 Nov)
  assert.equal(serverTimeToUtc('2024.07.15 10:30:00', 3), '2024-07-15T07:30:00.000Z');
  assert.equal(serverTimeToUtc('2024.07.15 10:30', -5), '2024-07-15T15:30:00.000Z');
});

test('MT5 report: positions only, values match the report', () => {
  const r = parseReport(fixture('mt5-report.html'), 3);
  assert.equal(r.kind, 'mt5');
  assert.deepEqual(r.errors, []);
  assert.equal(r.trades.length, 3); // Orders/Deals sections are not imported

  const [a, b, c] = r.trades;
  assert.equal(a.ticket, '501001');
  assert.equal(a.symbol, 'EURUSD');
  assert.equal(a.direction, 'buy');
  close(a.lot, 0.1);
  close(a.entry_price, 1.095);
  close(a.sl, 1.09);
  close(a.tp, 1.105);
  close(a.exit_price, 1.1025);
  assert.equal(a.open_time_utc, '2024-01-15T07:30:45.000Z');
  assert.equal(a.close_time_utc, '2024-01-15T11:05:10.000Z');
  close(a.commission, -0.7);
  close(a.profit, 75);
  assert.equal(a.source, 'mt5');

  assert.equal(b.direction, 'sell');
  close(b.entry_price, 2350.5); // "2 350.50": space as thousands separator
  assert.equal(b.sl, null); // blank S/L
  assert.equal(b.tp, null);
  close(b.swap, -0.05);
  close(b.profit, -9);

  close(c.profit, 1000);
  close(c.commission, -10.5);
});

test('MT4 statement: closed trades only, balance/cancelled/open rows skipped', () => {
  const r = parseReport(fixture('mt4-statement.html'), 'ny');
  assert.equal(r.kind, 'mt4');
  assert.deepEqual(r.errors, []);
  assert.equal(r.trades.length, 2);

  const [a, b] = r.trades;
  assert.equal(a.ticket, '40001');
  assert.equal(a.symbol, 'EURUSD');
  assert.equal(a.direction, 'buy');
  close(a.lot, 0.5);
  close(a.entry_price, 1.078);
  close(a.sl, 1.073);
  close(a.tp, 1.088);
  close(a.exit_price, 1.088);
  assert.equal(a.open_time_utc, '2024-02-05T06:15:00.000Z');
  close(a.commission, -3.5);
  close(a.profit, 500);
  assert.equal(a.source, 'mt4');

  assert.equal(b.sl, null); // 0.00000 means "not set"
  assert.equal(b.tp, null);
  close(b.swap, -1.2);
  close(b.profit, -400);
  assert.equal(b.open_time_utc, '2024-08-06T10:00:00.000Z'); // summer: GMT+3
});

test('UTF-16 report files (MetaTrader default) are decoded', () => {
  const text = fixture('mt5-report.html');
  const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
  assert.equal(decodeReport(le), text);
  assert.equal(parseReport(decodeReport(le), 3).trades.length, 3);
  const be = Buffer.from(le);
  for (let i = 0; i + 1 < be.length; i += 2) [be[i], be[i + 1]] = [be[i + 1], be[i]];
  assert.equal(decodeReport(be), text);
  assert.equal(decodeReport(Buffer.from(text, 'utf8')), text);
});

test('files that are not MT reports are rejected clearly', () => {
  assert.throws(() => parseReport('<html><body><table><tr><td>hello</td></tr></table></body></html>', 3), /MT4|MT5/);
  assert.throws(() => parseReport('not html at all', 3), /MT4|MT5/);
});

test('a malformed trade row is reported, not silently imported', () => {
  const broken = fixture('mt5-report.html').replace('<td>1.09500</td>', '<td>abc</td>');
  const r = parseReport(broken, 3);
  assert.equal(r.trades.length, 2);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /501001/);
});

// ---- server side ----
let s;
before(async () => { s = await startTestServer(); });
after(() => s.close());

const importBody = (trades, extra = {}) => ({ account_id: 1, trades, ...extra });
const mtTrade = (n, over = {}) => ({ ...sampleTrade(), ticket: String(n), source: 'mt5', ...over });

test('import inserts new trades and skips tickets that already exist', async () => {
  const first = await s.call('POST', '/api/trades/import', importBody([mtTrade(1), mtTrade(2)]));
  assert.equal(first.status, 200);
  assert.deepEqual({ inserted: first.json.inserted, skipped: first.json.skipped }, { inserted: 2, skipped: 0 });

  const again = await s.call('POST', '/api/trades/import', importBody([mtTrade(1), mtTrade(2), mtTrade(3)]));
  assert.deepEqual({ inserted: again.json.inserted, skipped: again.json.skipped }, { inserted: 1, skipped: 2 });
  const list = (await s.call('GET', '/api/trades?account_id=1')).json;
  assert.equal(list.filter((t) => t.source === 'mt5').length, 3);
});

test('import is all-or-nothing when a row is invalid', async () => {
  const before = (await s.call('GET', '/api/trades?account_id=1')).json.length;
  const r = await s.call('POST', '/api/trades/import', importBody([mtTrade(10), mtTrade(11, { lot: -1 })]));
  assert.equal(r.status, 400);
  assert.match(r.json.error, /11/);
  assert.equal((await s.call('GET', '/api/trades?account_id=1')).json.length, before);
});

test('import requires a ticket on every row and a sane payload', async () => {
  assert.equal((await s.call('POST', '/api/trades/import', importBody([{ ...mtTrade(20), ticket: '' }]))).status, 400);
  assert.equal((await s.call('POST', '/api/trades/import', { account_id: 1, trades: 'x' })).status, 400);
  assert.equal((await s.call('POST', '/api/trades/import', importBody([]))).status, 400);
  assert.equal((await s.call('POST', '/api/trades/import', importBody([mtTrade(30)], { account_id: 999 }))).status, 400);
});
