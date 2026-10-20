import { test } from 'node:test';
import assert from 'node:assert/strict';
import { holdingStats, maeR, mfeR, quantile, rollingMean, rHistogram, rSeries, sqn, MIN_SAMPLE, netPnl, netR, pipSize, pips, plannedRR, realizedR, session, stats, equitySeries, rangeBounds, inRange, dailyPnl, monthGrid, groupBy, isOpen, riskMoney, riskPcts, riskSummary } from '../public/lib/calc.js';

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

// ---- grouping ----
test('groupBy counts, winrate, net and average R per group', () => {
  const trades = [
    N(100, 1, { symbol: 'EURUSD', exit_price: 1.105 }), // +1R
    N(-50, 2, { symbol: 'EURUSD', exit_price: 1.095 }), // -1R
    N(30, 3, { symbol: 'XAUUSD', sl: null }),
  ];
  const g = Object.fromEntries(groupBy(trades, (t) => t.symbol).map((r) => [r.key, r]));
  assert.equal(g.EURUSD.count, 2);
  assert.equal(g.EURUSD.wins, 1);
  close(g.EURUSD.winrate, 50);
  close(g.EURUSD.net, 50);
  close(g.EURUSD.avgNet, 25);
  close(g.EURUSD.avgR, 0);
  assert.equal(g.XAUUSD.avgR, null);
  assert.equal(g.XAUUSD.count, 1);
});

test('groupBy lets a trade join several groups (tags) or none', () => {
  const trades = [N(10, 1, { tags: ['a', 'b'] }), N(20, 2, { tags: ['a'] }), N(5, 3, { tags: [] })];
  const g = Object.fromEntries(groupBy(trades, (t) => t.tags).map((r) => [r.key, r]));
  assert.equal(g.a.count, 2);
  close(g.a.net, 30);
  assert.equal(g.b.count, 1);
  assert.equal(Object.keys(g).length, 2); // the untagged trade is in no group
});

// ---- open trades are not counted (Task 14) ----
const OPEN = T({ exit_price: null, close_time_utc: null, profit: null, commission: 0, swap: 0 });

test('open trades have no result values', () => {
  assert.ok(isOpen(OPEN));
  assert.ok(!isOpen(SET[0]));
  assert.equal(pips(OPEN), null);
  assert.equal(realizedR(OPEN), null);
  assert.equal(netPnl(OPEN), null);
  close(plannedRR(OPEN), 2); // the plan is known before the trade closes
});

test('statistics, equity, calendar and groups skip open trades', () => {
  const withOpen = [...SET, OPEN];
  assert.deepEqual(stats(withOpen, 1000), stats(SET, 1000));
  assert.deepEqual(equitySeries(withOpen, 1000), equitySeries(SET, 1000));
  assert.deepEqual(dailyPnl(withOpen, 'UTC'), dailyPnl(SET, 'UTC'));
  assert.deepEqual(groupBy(withOpen, (t) => t.symbol), groupBy(SET, (t) => t.symbol));
  assert.ok(!inRange(OPEN, { from: '2024-01-01', to: null }, 'UTC'));
});

// ---- risk per trade (Task 15) ----
test('money at risk comes from the trade itself: profit per price unit x SL distance', () => {
  // buy 1.1000 -> 1.1080 made 80, so 1 price unit = 10000; SL 0.0050 away -> 50 at risk
  close(riskMoney(T({ profit: 80 })), 50);
  // a losing sell gives the same answer
  close(riskMoney(T({ direction: 'sell', entry_price: 1.1, sl: 1.105, exit_price: 1.108, profit: -80 })), 50);
  // JPY quote currency: the profit already includes the conversion
  close(riskMoney(T({ symbol: 'USDJPY', entry_price: 150, sl: 149.5, exit_price: 151, profit: 66 })), 33);
});

test('a typed risk amount wins; otherwise unknown cases give null', () => {
  close(riskMoney(T({ risk_amount: 25 })), 25);
  close(riskMoney(T({ exit_price: null, profit: null, risk_amount: 40 })), 40); // open trade
  assert.equal(riskMoney(T({ exit_price: null, profit: null })), null);
  assert.equal(riskMoney(T({ sl: null })), null);
  assert.equal(riskMoney(T({ exit_price: 1.1, profit: 0 })), null); // closed at entry: no price move to scale from
  assert.equal(riskMoney(T({ profit: -5 })), null); // price moved up on a buy but profit is negative: inconsistent
});

test('risk % uses the equity just before the trade opened', () => {
  const a = { ...N(100, 1), id: 1 }; // closes day 1, +100
  const b = { ...N(0, 2, { risk_amount: 22 }), id: 2 }; // opens day 2 with equity 1100 -> 2%
  const c = { ...N(0, 1, { risk_amount: 30, open_time_utc: '2024-03-01T09:00:00.000Z' }), id: 3 }; // opens before a closes -> 3% of 1000
  const pct = riskPcts([b, a, c], 1000);
  close(pct.get(2), 2);
  close(pct.get(3), 3);
});

test('risk summary: average and trades over the limit', () => {
  const pct = new Map([[1, 1], [2, 3], [3, null]]);
  const sum = riskSummary([{ id: 1 }, { id: 2 }, { id: 3 }], pct, 2);
  close(sum.avg, 2);
  assert.equal(sum.over, 1);
  assert.equal(sum.known, 2);
  assert.equal(riskSummary([], new Map(), 2).avg, null);
});

test('R uses the initial SL when the SL was trailed (task 17)', () => {
  const trailed = T({ symbol: 'XAUUSD', entry_price: 4000, initial_sl: 3900, sl: 4050, tp: null, exit_price: 4100 });
  close(realizedR(trailed), 1);
  assert.equal(realizedR(T({ initial_sl: null })), realizedR(T())); // old trades keep their R
  close(plannedRR(T({ initial_sl: 1.09 })), 1);
  close(riskMoney(T({ initial_sl: 1.09 })), 100); // $80 over 0.008 = $10,000 per unit x 0.01
});

test('net R counts swap and commission (task 18)', () => {
  close(netR(T({ risk_amount: 100, profit: 150, swap: -40, commission: 0 })), 1.1);
  close(netR(T()), 79 / 50); // derived risk: $80 / 0.008 x 0.005 = $50, net $79
  assert.equal(netR(T({ sl: null })), null);
  assert.equal(netR(T({ exit_price: null, profit: null })), null);
});

test('average R prefers net R and counts trades that fall back to gross R (task 18)', () => {
  const st = stats([N(100, 1, { exit_price: 1.105, swap: -20 }), N(0, 2, { exit_price: 1.105 })], 1000);
  close(st.avgR, (0.8 + 1) / 2); // first: (100 - 20) / 100; second has no derivable risk -> gross +1R
  assert.equal(st.rGross, 1);
  const g = groupBy([N(100, 1, { exit_price: 1.105, swap: -20 })], () => 'x')[0];
  close(g.avgR, 0.8);
});

test('SQN uses the sample standard deviation (task 21)', () => {
  close(sqn([1, -1, 2, -1, 1]), 0.6667, 1e-4);
  assert.equal(sqn([1]), null);
  assert.equal(sqn([1, 1]), null); // no spread: undefined
  assert.equal(MIN_SAMPLE, 30);
});

test('groupBy adds profit factor, SQN and a small-sample flag (task 21)', () => {
  const g = groupBy([N(100, 1, { exit_price: 1.105 }), N(-50, 2, { exit_price: 1.095 }), N(30, 3)], () => 'x')[0];
  close(g.profitFactor, 130 / 50);
  assert.ok(g.sqn != null);
  assert.equal(g.small, true);
  const only = groupBy([N(100, 1)], () => 'y')[0];
  assert.equal(only.profitFactor, null);
  assert.equal(only.sqn, null);
});

test('rolling mean of the last n values (task 22)', () => {
  assert.deepEqual(rollingMean([1, 2, 3, 4], 2), [1.5, 2.5, 3.5]);
  assert.deepEqual(rollingMean([1, 2], 3), []);
});

test('R histogram in 0.5R bins centred on round R, no gaps (task 22)', () => {
  // a -1R stop plus a little swap (-1.008R) must land in the -1R bin, not -1.5R
  assert.deepEqual(rHistogram([-1.008, -0.2, 0.3, 1.1, 1.4]), [
    { at: -1, count: 1 }, { at: -0.5, count: 0 }, { at: 0, count: 1 }, { at: 0.5, count: 1 }, { at: 1, count: 1 }, { at: 1.5, count: 1 },
  ]);
  assert.deepEqual(rHistogram([]), []);
});

test('R series follows close order and skips trades without R (task 22)', () => {
  const rs = rSeries([N(0, 2, { exit_price: 1.095 }), N(0, 1, { exit_price: 1.105 }), N(0, 3, { sl: null })]);
  assert.equal(rs.length, 2);
  close(rs[0], 1);
  close(rs[1], -1);
});

test('holding time per win and loss: median and p90 in days (task 23)', () => {
  const at = (d, h) => `2024-03-0${d}T${String(h).padStart(2, '0')}:00:00.000Z`;
  const h = holdingStats([
    N(10, 1, { open_time_utc: at(1, 0), close_time_utc: at(3, 0) }), // win 2d
    N(10, 1, { open_time_utc: at(1, 0), close_time_utc: at(5, 0) }), // win 4d
    N(-10, 1, { open_time_utc: at(1, 0), close_time_utc: at(1, 12) }), // loss 0.5d
  ]);
  close(h.win.median, 3);
  close(h.win.p90, 3.8);
  close(h.loss.median, 0.5);
  assert.equal(h.win.count, 2);
  assert.equal(holdingStats([]).win.median, null);
  close(quantile([1, 2, 3, 4], 0.5), 2.5);
});

test('MAE / MFE in R from the initial risk (task 23)', () => {
  const t = T({ symbol: 'XAUUSD', entry_price: 4000, initial_sl: 3900, sl: 4050, mae: 3950, mfe: 4150 });
  close(maeR(t), 0.5);
  close(mfeR(t), 1.5);
  assert.equal(maeR(T()), null);
  assert.equal(mfeR(T({ mfe: 1.2, sl: null })), null);
});

test('deposits and withdrawals move equity but not drawdown (task 24)', () => {
  const trades = [N(100, 1), N(-50, 3)];
  const flows = [{ time_utc: '2024-03-02T00:00:00.000Z', amount: 1000 }, { time_utc: '2024-03-04T00:00:00.000Z', amount: -200 }];
  const plain = stats(trades, 1000);
  const st = stats(trades, 1000, flows);
  assert.equal(st.maxDrawdown.amount, plain.maxDrawdown.amount); // 50 either way
  close(st.maxDrawdown.pct, (50 / 2100) * 100); // against equity incl. the deposit before the loss
  close(st.equity, 1000 + 50 + 1000 - 200);
  close(st.growthPct, (50 / 1800) * 100);
  const eq = equitySeries(trades, 1000, flows);
  assert.deepEqual(eq.map((p) => p.equity), [1000, 1100, 2050]);
  close(plain.maxDrawdown.pct, (50 / 1100) * 100); // unchanged without cash flows
});
