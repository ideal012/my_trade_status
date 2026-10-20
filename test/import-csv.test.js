import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startTestServer } from './helpers.js';
import { parseBacktestCsv } from '../public/lib/import-csv.js';
import { netR } from '../public/lib/calc.js';

const csv = readFileSync(new URL('./fixtures/backtest.csv', import.meta.url), 'utf8');
const STRATS = [{ id: 7, name: 'Trend Following D1 (MA + TSMOM)' }, { id: 8, name: 'Donchian / Turtle Breakout 55/20' }];

let s;
before(async () => { s = await startTestServer(); });
after(() => s.close());

test('backtest CSV: good rows read, bad row reported, unknown strategy noted (task 20)', () => {
  const { trades, errors, warnings } = parseBacktestCsv(csv, STRATS);
  assert.equal(trades.length, 4);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /trend-d1-2019-10-01/);
  const [first] = trades;
  assert.equal(first.strategy_id, 7);
  assert.equal(first.initial_sl, 1250);
  assert.equal(first.sl, 1250);
  assert.equal(first.source, 'csv-backtest');
  assert.equal(trades[2].strategy_id, null); // quoted name with a comma, not a known strategy
  assert.equal(warnings.length, 1);
  assert.equal(trades.reduce((a, t) => a + netR(t), 0).toFixed(2), (1.8 - 1.05 + 0.41 - 0.6).toFixed(2));
});

test('backtest CSV: wrong header is rejected (task 20)', () => {
  assert.throws(() => parseBacktestCsv('a,b,c\n1,2,3', STRATS), /หัวตาราง/);
});

test('backtest CSV imports only into a backtest account, and again without duplicates (task 20)', async () => {
  const { trades } = parseBacktestCsv(csv, []);
  const live = await s.call('POST', '/api/accounts', { name: 'Real', initial_capital: 100 });
  assert.equal((await s.call('POST', '/api/trades/import', { account_id: live.json.id, trades })).status, 400);
  const bt = await s.call('POST', '/api/accounts', { name: 'BT', initial_capital: 10000, kind: 'backtest' });
  const first = await s.call('POST', '/api/trades/import', { account_id: bt.json.id, trades });
  assert.equal(first.status, 200);
  assert.equal(first.json.inserted, 4);
  const again = await s.call('POST', '/api/trades/import', { account_id: bt.json.id, trades });
  assert.deepEqual(again.json, { inserted: 0, skipped: 4 });
});
