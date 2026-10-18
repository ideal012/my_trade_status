import { dayKey, weekdayOf } from './time.js';

// Trade maths. Pure functions (no DOM, no DB) so they run in the browser and under node:test.

export const netPnl = (t) => t.profit + t.commission + t.swap;

const dir = (t) => (t.direction === 'buy' ? 1 : -1);

// ponytail: symbol-name heuristic, wrong for exotic instruments. Pip is display-only; RR/R use raw price.
export function pipSize(symbol) {
  const s = symbol.toUpperCase();
  if (s.includes('JPY')) return 0.01;
  if (s.includes('XAU')) return 0.1;
  return 0.0001;
}

export const pips = (t) => ((t.exit_price - t.entry_price) * dir(t)) / pipSize(t.symbol);

const risk = (t) => (t.sl == null ? 0 : Math.abs(t.entry_price - t.sl));

export function plannedRR(t) {
  return t.sl == null || t.tp == null || !risk(t) ? null : Math.abs(t.tp - t.entry_price) / risk(t);
}

export function realizedR(t) {
  return t.sl == null || !risk(t) ? null : ((t.exit_price - t.entry_price) * dir(t)) / risk(t);
}

// ponytail: fixed UTC hour bands, ignores DST shifts of London/NY opens (about 1h error half the year).
export function session(openIso) {
  const h = new Date(openIso).getUTCHours();
  if (h >= 7 && h < 12) return 'London';
  if (h >= 12 && h < 16) return 'London/NY';
  if (h >= 16 && h < 21) return 'New York';
  return 'Asia';
}

// ---- aggregate statistics ----

const byClose = (trades) => [...trades].sort((a, b) => a.close_time_utc.localeCompare(b.close_time_utc) || a.id - b.id);

// Equity after each closed trade (in close order), starting from the initial capital.
export function equitySeries(trades, initial) {
  let equity = initial;
  const points = [{ t: null, equity, n: 0 }];
  byClose(trades).forEach((t, i) => {
    equity += netPnl(t);
    points.push({ t: t.close_time_utc, equity, n: i + 1 });
  });
  return points;
}

export function maxDrawdown(series) {
  let peak = -Infinity;
  let best = { amount: 0, pct: 0 };
  for (const { equity } of series) {
    peak = Math.max(peak, equity);
    const amount = peak - equity;
    if (amount > best.amount) best = { amount, pct: peak > 0 ? (amount / peak) * 100 : 0 };
  }
  return best;
}

export function stats(trades, initial) {
  const sorted = byClose(trades);
  const nets = sorted.map(netPnl);
  const wins = nets.filter((n) => n > 0);
  const losses = nets.filter((n) => n < 0);
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const grossWin = sum(wins);
  const grossLoss = sum(losses);
  const net = sum(nets);
  const rs = sorted.map(realizedR).filter((r) => r != null);

  let maxWinStreak = 0;
  let maxLossStreak = 0;
  let w = 0;
  let l = 0;
  for (const n of nets) {
    w = n > 0 ? w + 1 : 0;
    l = n < 0 ? l + 1 : 0;
    maxWinStreak = Math.max(maxWinStreak, w);
    maxLossStreak = Math.max(maxLossStreak, l);
  }

  return {
    count: nets.length,
    wins: wins.length,
    losses: losses.length,
    winrate: nets.length ? (wins.length / nets.length) * 100 : null,
    net,
    equity: initial + net,
    growthPct: initial > 0 ? (net / initial) * 100 : null,
    grossWin,
    grossLoss,
    profitFactor: losses.length && wins.length ? grossWin / -grossLoss : null,
    avgWin: wins.length ? grossWin / wins.length : null,
    avgLoss: losses.length ? grossLoss / losses.length : null,
    avgR: rs.length ? sum(rs) / rs.length : null,
    expectancy: nets.length ? net / nets.length : null,
    maxDrawdown: maxDrawdown(equitySeries(trades, initial)),
    maxWinStreak,
    maxLossStreak,
    best: sorted.reduce((b, t) => (!b || netPnl(t) > netPnl(b) ? t : b), null),
    worst: sorted.reduce((b, t) => (!b || netPnl(t) < netPnl(b) ? t : b), null),
  };
}

// ---- date ranges (by day of close, in the display timezone) ----

const addDays = (day, n) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

// kind: 'week' (Monday start) | 'month' | 'all'. Returns { from, to } as 'YYYY-MM-DD' (null = open) or null for all.
export function rangeBounds(kind, timeZone, now = new Date()) {
  const iso = now.toISOString();
  const today = dayKey(iso, timeZone);
  if (kind === 'week') return { from: addDays(today, -weekdayOf(iso, timeZone)), to: null };
  if (kind === 'month') return { from: `${today.slice(0, 8)}01`, to: null };
  return null;
}

export function inRange(trade, range, timeZone) {
  if (!range) return true;
  const day = dayKey(trade.close_time_utc, timeZone);
  return (!range.from || day >= range.from) && (!range.to || day <= range.to);
}

// ---- calendar ----

// { 'YYYY-MM-DD': { net, count } } by day of close in timeZone
export function dailyPnl(trades, timeZone) {
  const days = {};
  for (const t of trades) {
    const d = (days[dayKey(t.close_time_utc, timeZone)] ??= { net: 0, count: 0 });
    d.net += netPnl(t);
    d.count += 1;
  }
  return days;
}

// Cells for a Monday-first month grid: 'YYYY-MM-DD' or null padding. month is 1-12.
export function monthGrid(year, month) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const cells = Array(lead).fill(null);
  for (let d = 1; d <= last; d++) cells.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}
