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
