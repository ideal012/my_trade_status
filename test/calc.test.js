import { test } from 'node:test';
import assert from 'node:assert/strict';
import { netPnl, pipSize, pips, plannedRR, realizedR, session } from '../public/lib/calc.js';

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
