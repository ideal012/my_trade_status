// Small dashboard charts: win/loss ring, daily P/L bars, P/L by emotion.
import { makeChart, num, signed, COLORS } from '../lib/ui.js';
import { dailyPnl, groupBy, netPnl } from '../lib/calc.js';

export function drawRing(canvas, st) {
  const be = st.count - st.wins - st.losses;
  makeChart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['ชนะ', 'แพ้', 'เสมอ'],
      datasets: [{ data: [st.wins, st.losses, be], backgroundColor: [COLORS.pos, COLORS.neg, COLORS.muted], borderWidth: 0, spacing: 2, borderRadius: 4 }],
    },
    options: { cutout: '74%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (i) => `${i.label}: ${i.parsed} ไม้` } } } },
  });
}

// last 30 trading days in the period, one bar per day
export function drawDaily(canvas, trades, tz) {
  const days = Object.entries(dailyPnl(trades, tz)).sort(([a], [b]) => a.localeCompare(b)).slice(-30);
  makeChart(canvas, {
    type: 'bar',
    data: {
      labels: days.map(([d]) => d.slice(5)),
      datasets: [{ data: days.map(([, v]) => v.net), backgroundColor: days.map(([, v]) => (v.net >= 0 ? COLORS.pos : COLORS.neg)), borderRadius: 3, maxBarThickness: 18 }],
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { title: (i) => days[i[0].dataIndex][0], label: (i) => `${signed(i.parsed.y)} · ${days[i.dataIndex][1].count} ไม้` } },
      },
      scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 6, maxRotation: 0 } }, y: { ticks: { callback: (v) => num(v, 0) } } },
    },
  });
}

// returns false when no trade has an emotion yet (the caller then shows a hint instead of a chart)
export function drawEmotion(canvas, trades) {
  const rows = groupBy(trades.filter((t) => t.emotion), (t) => t.emotion).sort((a, b) => b.net - a.net);
  if (!rows.length) return false;
  makeChart(canvas, {
    type: 'bar',
    data: { labels: rows.map((r) => r.key), datasets: [{ data: rows.map((r) => r.net), backgroundColor: rows.map((r) => (r.net >= 0 ? COLORS.pos : COLORS.neg)), borderRadius: 3, maxBarThickness: 18 }] },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (i) => `${signed(i.parsed.x)} · ${rows[i.dataIndex].count} ไม้` } } },
      scales: { y: { grid: { display: false } }, x: { ticks: { callback: (v) => num(v, 0) } } },
    },
  });
  return true;
}

export const binLabel = (b, w = 0.5) => `${signed(b.at, 1)}R (${signed(b.at - w / 2, 2)} ถึง ${signed(b.at + w / 2, 2)})`;

export function drawRHist(canvas, bins) {
  makeChart(canvas, {
    type: 'bar',
    data: { labels: bins.map((b) => signed(b.at, 1)), datasets: [{ data: bins.map((b) => b.count), backgroundColor: bins.map((b) => (b.at > 0 ? COLORS.pos : b.at < 0 ? COLORS.neg : COLORS.muted)), borderRadius: 3 }] },
    options: {
      plugins: { legend: { display: false }, tooltip: { callbacks: { title: (i) => binLabel(bins[i[0].dataIndex]), label: (i) => `${i.parsed.y} ไม้` } } },
      scales: { x: { grid: { display: false }, title: { display: true, text: 'R (ช่องละ 0.5R ปัดเข้าค่าใกล้สุด)' } }, y: { ticks: { precision: 0 } } },
    },
  });
}

// rolling expectancy of the last n trades; ref = backtest average R drawn as a dashed line (or null)
export function drawRolling(canvas, roll, n, ref) {
  const datasets = [{ label: `เฉลี่ย ${n} ไม้ล่าสุด`, data: roll, borderColor: COLORS.accent, borderWidth: 2, pointRadius: 0, tension: 0.2 }];
  if (ref != null) datasets.push({ label: 'Backtest', data: roll.map(() => ref), borderColor: COLORS.muted, borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0 });
  makeChart(canvas, {
    type: 'line',
    data: { labels: roll.map((_, i) => `ไม้ที่ ${i + n}`), datasets },
    options: {
      plugins: { legend: { display: ref != null }, tooltip: { callbacks: { label: (i) => `${i.dataset.label}: ${signed(i.parsed.y)}R` } } },
      scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 6, maxRotation: 0 } }, y: { ticks: { callback: (v) => num(v, 2) } } },
    },
  });
}

export const lastTrades = (trades, n) => [...trades].sort((a, b) => b.close_time_utc.localeCompare(a.close_time_utc)).slice(0, n);
export { netPnl };
