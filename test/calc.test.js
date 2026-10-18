import { test } from 'node:test';
import assert from 'node:assert/strict';
import { netPnl, pipSize, pips, plannedRR, realizedR, session, stats, equitySeries, rangeBounds, inRange, dailyPnl, monthGrid } from '../public/lib/calc.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);
const T = (over = {}) => ({
  symbol: 'EURUSD', direction: 'buy', entry_price: 1.1, sl: 1.095, tp: 1.11, exit_price: 1.108,
  open_time_utc: '2024-03-04T08:00:00.000Z', profit: 80, commission: -0.7, swap: -0.3, ...over,
});

test('net P/L = profit + commission + swap', () => {
  close(netPnl(T()), 79);
});

test('pip size by symbol', () => {
  assert.equal(pipSize('EURUSD'), 0.0001);
  assert.equal(pipSize('EURUSDm'), 0.0001);
  assert.equal(pipSize('USDJPY.pro'), 0.01);
  assert.equal(pipSize('XAUUSD'), 0.1);
});

test('pips for buy, sell, JPY and gold', () => {
  close(pips(T()), 80);
  close(pips(T({ direction: 'sell', entry_price: 1.1, exit_price: 1.092 })), 80);
  close(pips(T({ direction: 'sell', exit_price: 1.108 })), -80);
  close(pips(T({ symbol: 'USDJPY', entry_price: 150, exit_price: 150.5 })), 50);
  close(pips(T({ symbol: 'XAUUSD', entry_price: 2000, exit_price: 2005 })), 50);
});

test('planned RR needs SL and TP', () => {
  close(plannedRR(T()), 2);
  close(plannedRR(T({ direction: 'sell', entry_price: 1.1, sl: 1.105, tp: 1.09 })), 2);
  assert.equal(plannedRR(T({ sl: null })), null);
  assert.equal(plannedRR(T({ tp: null })), null);
  assert.equal(plannedRR(T({ sl: 1.1 })), null); // SL at entry: no risk to divide by
});

test('realized R in units of initial risk', () => {
  close(realizedR(T()), 1.6);
  close(realizedR(T({ exit_price: 1.095 })), -1);
  close(realizedR(T({ direction: 'sell', sl: 1.105, exit_price: 1.09 })), 2);
  assert.equal(realizedR(T({ sl: null })), null);
});

test('trading session from UTC open time', () => {
  const at = (h) => session(`2024-03-04T${String(h).padStart(2, '0')}:30:00.000Z`);
  assert.equal(at(3), 'Asia');
  assert.equal(at(8), 'London');
  assert.equal(at(13), 'London/NY');
  assert.equal(at(17), 'New York');
  assert.equal(at(22), 'Asia');
  assert.equal(at(7), 'London');
  assert.equal(session('2024-03-04T07:00:00.000Z'), 'London');
  assert.equal(session('2024-03-04T06:59:59.000Z'), 'Asia');
});

// ---- statistics ----
const N = (net, day, over = {}) => T({
  profit: net, commission: 0, swap: 0,
  open_time_utc: `2024-03-0${day}T08:00:00.000Z`, close_time_utc: `2024-03-0${day}T10:00:00.000Z`, ...over,
});
// equity from 1000: 1100, 1050, 1080, 1000, 980, 1040
const SET = [N(100, 1), N(-50, 2), N(30, 3), N(-80, 4), N(-20, 5), N(60, 6)];

test('headline statistics', () => {
  const st = stats([...SET].reverse(), 1000); // input order must not matter
  assert.equal(st.count, 6);
  assert.equal(st.wins, 3);
  assert.equal(st.losses, 3);
  close(st.winrate, 50);
  close(st.net, 40);
  close(st.equity, 1040);
  close(st.growthPct, 4);
  close(st.profitFactor, 190 / 150);
  close(st.avgWin, 190 / 3);
  close(st.avgLoss, -50);
  close(st.expectancy, 40 / 6);
  close(st.maxDrawdown.amount, 120);
  close(st.maxDrawdown.pct, (120 / 1100) * 100);
  assert.equal(st.maxWinStreak, 1);
  assert.equal(st.maxLossStreak, 2);
  assert.equal(st.best.profit, 100);
  assert.equal(st.worst.profit, -80);
});

test('statistics edge cases: empty, no losses, breakeven, zero capital', () => {
  const empty = stats([], 1000);
  assert.equal(empty.count, 0);
  assert.equal(empty.winrate, null);
  assert.equal(empty.profitFactor, null);
  assert.equal(empty.maxDrawdown.amount, 0);
  assert.equal(empty.equity, 1000);

  const wins = stats([N(10, 1), N(20, 2)], 1000);
  assert.equal(wins.profitFactor, null); // no losing trade: undefined, shown as a dash
  assert.equal(wins.maxDrawdown.amount, 0);

  const be = stats([N(0, 1), N(50, 2)], 1000);
  assert.equal(be.count, 2);
  assert.equal(be.wins, 1);
  assert.equal(be.losses, 0);
  close(be.winrate, 50);

  assert.equal(stats([N(10, 1)], 0).growthPct, null);
});

test('commission and swap count towards net, wins and losses', () => {
  const st = stats([N(10, 1, { commission: -15, swap: 0 })], 100); // gross +10 but net -5
  assert.equal(st.losses, 1);
  close(st.net, -5);
});

test('average R uses only trades that have an SL', () => {
  const st = stats([N(0, 1, { exit_price: 1.105 }), N(0, 2, { exit_price: 1.095 }), N(0, 3, { sl: null })], 1000);
  close(st.avgR, 0); // +1R and -1R, third ignored
  assert.equal(stats([N(0, 3, { sl: null })], 1000).avgR, null);
});

test('equity series starts at capital and follows close order', () => {
  const eq = equitySeries([...SET].reverse(), 1000);
  assert.deepEqual(eq.map((p) => p.equity), [1000, 1100, 1050, 1080, 1000, 980, 1040]);
  assert.equal(eq[0].n, 0);
  assert.equal(eq.at(-1).n, 6);
});

test('range presets follow the timezone', () => {
  const now = new Date('2024-03-06T10:00:00Z'); // Wednesday
  assert.deepEqual(rangeBounds('week', 'UTC', now), { from: '2024-03-04', to: null });
  assert.deepEqual(rangeBounds('month', 'UTC', now), { from: '2024-03-01', to: null });
  assert.equal(rangeBounds('all', 'UTC', now), null);
  // Sunday 18:00 UTC is already Monday 01:00 in Bangkok, so a new week has started there
  assert.equal(rangeBounds('week', 'Asia/Bangkok', new Date('2024-03-10T18:00:00Z')).from, '2024-03-11');
  assert.equal(rangeBounds('week', 'UTC', new Date('2024-03-10T18:00:00Z')).from, '2024-03-04');
});

test('inRange compares close day in timezone', () => {
  const t = N(1, 5); // closes 2024-03-05 10:00Z
  assert.ok(inRange(t, { from: '2024-03-05', to: '2024-03-05' }, 'UTC'));
  assert.ok(!inRange(t, { from: '2024-03-06', to: null }, 'UTC'));
  assert.ok(inRange(t, null, 'UTC'));
});

// ---- calendar ----
test('daily P/L groups by close day in the chosen timezone', () => {
  const late = N(40, 4, { close_time_utc: '2024-03-04T18:00:00.000Z' }); // 01:00 on the 5th in Bangkok
  const same = N(10, 5, { close_time_utc: '2024-03-05T02:00:00.000Z' });
  const utc = dailyPnl([late, same], 'UTC');
  assert.deepEqual(utc['2024-03-04'], { net: 40, count: 1 });
  assert.deepEqual(utc['2024-03-05'], { net: 10, count: 1 });
  const bkk = dailyPnl([late, same], 'Asia/Bangkok');
  assert.deepEqual(bkk['2024-03-05'], { net: 50, count: 2 });
  assert.equal(bkk['2024-03-04'], undefined);
});

test('daily totals add up to the overall net', () => {
  const d = dailyPnl(SET, 'UTC');
  const total = Object.values(d).reduce((s, x) => s + x.net, 0);
  close(total, stats(SET, 0).net);
});

test('month grid starts on Monday and pads to full weeks', () => {
  const grid = monthGrid(2024, 3); // 1 March 2024 is a Friday
  assert.equal(grid.length % 7, 0);
  assert.deepEqual(grid.slice(0, 4), [null, null, null, null]);
  assert.equal(grid[4], '2024-03-01');
  assert.equal(grid.filter(Boolean).length, 31);
  assert.equal(grid.filter(Boolean).at(-1), '2024-03-31');
  assert.equal(monthGrid(2024, 2).filter(Boolean).length, 29); // leap year
});
