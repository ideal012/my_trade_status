import { dayKey, weekdayOf } from './time.js';

// Trade maths. Pure functions (no DOM, no DB) so they run in the browser and under node:test.

// A trade without an exit price is still open: it has a plan (RR) but no result yet,
// and every statistic below leaves it out.
export const isOpen = (t) => t.exit_price == null;

export const netPnl = (t) => (isOpen(t) || t.profit == null ? null : t.profit + t.commission + t.swap);

const dir = (t) => (t.direction === 'buy' ? 1 : -1);

// ponytail: symbol-name heuristic, wrong for exotic instruments. Pip is display-only; RR/R use raw price.
export function pipSize(symbol) {
  const s = symbol.toUpperCase();
  if (s.includes('JPY')) return 0.01;
  if (s.includes('XAU')) return 0.1;
  return 0.0001;
}

export const pips = (t) => (isOpen(t) ? null : ((t.exit_price - t.entry_price) * dir(t)) / pipSize(t.symbol));

// Risk is measured from the SL at entry: a trailed SL must not shrink the R of the trade.
const risk = (t) => {
  const sl = t.initial_sl ?? t.sl;
  return sl == null ? 0 : Math.abs(t.entry_price - sl);
};

export function plannedRR(t) {
  return t.tp == null || !risk(t) ? null : Math.abs(t.tp - t.entry_price) / risk(t);
}

export function realizedR(t) {
  return isOpen(t) || !risk(t) ? null : ((t.exit_price - t.entry_price) * dir(t)) / risk(t);
}

// R after commission and swap: net P/L over the money at risk. null when the money at risk is unknown.
export function netR(t) {
  const money = riskMoney(t);
  const net = netPnl(t);
  return money == null || net == null ? null : net / money;
}

// Net R when known, otherwise the gross (price-only) R.
const rOf = (t) => netR(t) ?? realizedR(t);

// ponytail: fixed UTC hour bands, ignores DST shifts of London/NY opens (about 1h error half the year).
export function session(openIso) {
  const h = new Date(openIso).getUTCHours();
  if (h >= 7 && h < 12) return 'London';
  if (h >= 12 && h < 16) return 'London/NY';
  if (h >= 16 && h < 21) return 'New York';
  return 'Asia';
}

// ---- aggregate statistics ----

const byClose = (trades) => trades.filter((t) => !isOpen(t)).sort((a, b) => a.close_time_utc.localeCompare(b.close_time_utc) || a.id - b.id);

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
  const rs = sorted.map(rOf).filter((r) => r != null);
  const rGross = sorted.filter((t) => netR(t) == null && realizedR(t) != null).length;

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
    rGross, // trades in avgR whose R is before commission and swap
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
  if (isOpen(trade)) return false;
  const day = dayKey(trade.close_time_utc, timeZone);
  return (!range.from || day >= range.from) && (!range.to || day <= range.to);
}

// ---- calendar ----

// { 'YYYY-MM-DD': { net, count } } by day of close in timeZone
export function dailyPnl(trades, timeZone) {
  const days = {};
  for (const t of trades) {
    if (isOpen(t)) continue;
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

// ---- edge reliability ----

// Below this many trades a group's numbers are mostly noise.
export const MIN_SAMPLE = 30;

// System Quality Number = sqrt(n) x mean / sample sd. Same value as the t-statistic of the mean R.
export function sqn(rs) {
  const n = rs.length;
  if (n < 2) return null;
  const mean = rs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(rs.reduce((a, r) => a + (r - mean) ** 2, 0) / (n - 1));
  return sd ? (Math.sqrt(n) * mean) / sd : null;
}

// ---- grouping ----

// keyFn(trade) returns one key, or an array of keys (a trade joins every group), or [] for none.
export function groupBy(trades, keyFn) {
  const groups = new Map();
  for (const t of trades) {
    if (isOpen(t)) continue;
    for (const key of [keyFn(t)].flat()) {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }
  }
  return [...groups].map(([key, list]) => {
    const nets = list.map(netPnl);
    const rs = list.map(rOf).filter((r) => r != null);
    const net = nets.reduce((a, b) => a + b, 0);
    const grossWin = nets.filter((n) => n > 0).reduce((a, b) => a + b, 0);
    const grossLoss = -nets.filter((n) => n < 0).reduce((a, b) => a + b, 0);
    return {
      key,
      count: list.length,
      wins: nets.filter((n) => n > 0).length,
      winrate: (nets.filter((n) => n > 0).length / list.length) * 100,
      net,
      avgNet: net / list.length,
      avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
      profitFactor: grossWin && grossLoss ? grossWin / grossLoss : null,
      sqn: sqn(rs),
      small: list.length < MIN_SAMPLE,
    };
  });
}

// ---- risk per trade ----

// Money lost if the SL is hit. A typed risk_amount wins. Otherwise it is derived from the trade's own
// result: profit / price distance moved = money per price unit (lot size and currency conversion are
// already inside the profit), times the SL distance. Unknown -> null.
export function riskMoney(t) {
  if (t.risk_amount != null) return t.risk_amount;
  if (isOpen(t) || t.profit == null || !risk(t)) return null;
  const moved = (t.exit_price - t.entry_price) * dir(t);
  if (!moved) return null;
  const perUnit = t.profit / moved;
  return perUnit > 0 ? perUnit * risk(t) : null;
}

// Map trade id -> risk as % of equity just before the trade opened
// (initial capital + net of every trade that closed before that moment).
export function riskPcts(trades, initial) {
  const closes = byClose(trades);
  const out = new Map();
  let i = 0;
  let equity = initial;
  for (const t of [...trades].sort((a, b) => a.open_time_utc.localeCompare(b.open_time_utc))) {
    while (i < closes.length && closes[i].close_time_utc <= t.open_time_utc) equity += netPnl(closes[i++]);
    const money = riskMoney(t);
    out.set(t.id, money == null || equity <= 0 ? null : (money / equity) * 100);
  }
  return out;
}

export function riskSummary(trades, pcts, maxPct) {
  const known = trades.map((t) => pcts.get(t.id)).filter((p) => p != null);
  return {
    known: known.length,
    avg: known.length ? known.reduce((a, b) => a + b, 0) / known.length : null,
    over: known.filter((p) => p > maxPct).length,
  };
}
