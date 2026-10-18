import { html, setHtml, state, account, loadTrades, num, signed, tone, pct, makeChart, COLORS } from '../lib/ui.js';
import { dayKey, fmtTime } from '../lib/time.js';
import { stats, netPnl, inRange, equitySeries, dailyPnl, monthGrid } from '../lib/calc.js';
import { readRange, rangeFilter, rangeBar, bindRangeBar } from '../lib/range.js';

const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const DOW = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'];
let calMonth = null; // { y, m } being shown, kept while the user flips between pages

const card = (label, value, { cls = '', hint = '', big = false } = {}) => html`
  <div class="card stat ${big ? 'big' : ''}">
    <div class="label">${label}</div>
    <div class="value ${cls}">${value}</div>
    <div class="hint">${hint || ' '}</div>
  </div>`;

export async function render(view) {
  const tz = state.settings.timezone;
  const acc = account();
  const all = await loadTrades();
  const sel = readRange();
  const { bounds, label } = rangeFilter(sel, tz);

  const inside = all.filter((t) => inRange(t, bounds, tz));
  // capital at the start of the chosen period = initial capital + everything that closed before it
  const before = bounds?.from ? all.filter((t) => dayKey(t.close_time_utc, tz) < bounds.from) : [];
  const startCapital = acc.initial_capital + before.reduce((s, t) => s + netPnl(t), 0);
  const st = stats(inside, startCapital);
  const now = stats(all, acc.initial_capital);
  const cur = acc.currency;

  setHtml(view, html`
    <div class="page-head">
      <div><h1>ภาพรวม</h1><p class="sub">${acc.name} · ${label} · เวลาตามโซน ${tz}</p></div>
      ${rangeBar(sel)}
    </div>

    ${all.length ? '' : html`<div class="card empty">ยังไม่มีเทรด — ไปที่ <a href="#/trades">รายการเทรด</a> เพื่อเพิ่มไม้แรก หรือใช้ <a href="#/import">Import</a> จาก MT4/MT5</div>`}

    <div class="grid">
      ${card('กำไรสุทธิ', `${signed(st.net)} ${cur}`, { big: true, cls: tone(st.net), hint: st.growthPct == null ? '' : `${signed(st.growthPct)}% ของทุนต้นช่วง` })}
      ${card('ทุนปัจจุบัน', `${num(now.equity)} ${cur}`, { big: true, hint: `ทุนเริ่มต้น ${num(acc.initial_capital)} · ทั้งหมด ${signed(now.net)}` })}
      ${card('Winrate', pct(st.winrate), { big: true, hint: `ชนะ ${st.wins} · แพ้ ${st.losses} · จาก ${st.count} ไม้` })}
      ${card('Profit Factor', st.profitFactor == null ? '—' : num(st.profitFactor), { big: true, hint: 'กำไรรวม ÷ ขาดทุนรวม (>1 = กำไร)' })}
    </div>
    <div class="grid">
      ${card('กำไรเฉลี่ยต่อไม้ชนะ', signed(st.avgWin), { cls: 'pos' })}
      ${card('ขาดทุนเฉลี่ยต่อไม้แพ้', signed(st.avgLoss), { cls: 'neg' })}
      ${card('R เฉลี่ย', st.avgR == null ? '—' : signed(st.avgR), { cls: tone(st.avgR), hint: 'กำไร/ขาดทุนเป็นเท่าของความเสี่ยง (ต้องมี SL)' })}
      ${card('Expectancy ต่อไม้', signed(st.expectancy), { cls: tone(st.expectancy), hint: 'คาดว่าได้/เสียเฉลี่ยต่อไม้' })}
      ${card('Max Drawdown', st.count ? `−${num(st.maxDrawdown.amount)}` : '—', { cls: st.maxDrawdown.amount ? 'neg' : '', hint: st.count ? `−${num(st.maxDrawdown.pct)}% จากจุดสูงสุด` : '' })}
      ${card('ชนะติดกันสูงสุด', st.maxWinStreak, { hint: 'ไม้' })}
      ${card('แพ้ติดกันสูงสุด', st.maxLossStreak, { hint: 'ไม้' })}
    </div>

    <div class="card">
      <h2>Equity curve <small class="sub">เส้นทุนหลังปิดแต่ละไม้ · แรเงาแดง = ช่วงที่ทุนต่ำกว่าจุดสูงสุดเดิม (drawdown)</small></h2>
      ${st.count ? html`<div class="chart-box"><canvas id="equity"></canvas></div>` : html`<div class="empty">ยังไม่มีเทรดในช่วงนี้</div>`}
    </div>

    <div class="card" id="calendar"></div>`);

  if (st.count) drawEquity(view.querySelector('#equity'), equitySeries(inside, startCapital), tz);
  drawCalendar(view, all, tz, cur);

  bindRangeBar(view, sel, () => render(view));
}

function drawEquity(canvas, series, tz) {
  let peak = -Infinity;
  const peaks = series.map((p) => (peak = Math.max(peak, p.equity)));
  makeChart(canvas, {
    type: 'line',
    data: {
      labels: series.map((p) => (p.n === 0 ? 'เริ่มต้น' : `ไม้ที่ ${p.n}`)),
      datasets: [
        { label: 'จุดสูงสุดเดิม', data: peaks, borderColor: COLORS.muted, borderDash: [4, 4], borderWidth: 1, pointRadius: 0, fill: false },
        {
          label: 'Equity', data: series.map((p) => p.equity), borderColor: COLORS.accent, borderWidth: 2,
          pointRadius: series.length < 40 ? 3 : 0, tension: 0.15, fill: '-1', backgroundColor: 'rgba(198, 40, 40, 0.14)',
        },
      ],
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            title: (items) => { const p = series[items[0].dataIndex]; return p.t ? `${items[0].label} · ${fmtTime(p.t, tz)}` : 'ทุนเริ่มต้นของช่วงนี้'; },
            label: (item) => `${item.dataset.label}: ${num(item.parsed.y)}`,
          },
        },
      },
      scales: { x: { ticks: { maxTicksLimit: 10 } }, y: { ticks: { callback: (v) => num(v, 0) } } },
    },
  });
}

function drawCalendar(view, all, tz, cur) {
  const box = view.querySelector('#calendar');
  if (!calMonth) {
    const [y, m] = dayKey(new Date().toISOString(), tz).split('-').map(Number);
    calMonth = { y, m };
  }
  const { y, m } = calMonth;
  const days = dailyPnl(all, tz);
  const cells = monthGrid(y, m);
  const monthDays = cells.filter(Boolean).map((d) => days[d]).filter(Boolean);
  const monthNet = monthDays.reduce((s, d) => s + d.net, 0);

  setHtml(box, html`
    <div class="page-head">
      <h2>ปฏิทินกำไรรายวัน · ${MONTHS[m - 1]} ${y}</h2>
      <div class="row">
        <span class="${tone(monthNet)}"><b>${signed(monthNet)} ${cur}</b> <small class="sub">(${monthDays.length} วันที่เทรด)</small></span>
        <button data-step="-1" aria-label="เดือนก่อน">‹</button>
        <button data-step="0">เดือนนี้</button>
        <button data-step="1" aria-label="เดือนถัดไป">›</button>
      </div>
    </div>
    <div class="cal">
      ${DOW.map((d) => html`<div class="dow">${d}</div>`)}
      ${cells.map((d) => {
        if (!d) return html`<div class="day out"></div>`;
        const x = days[d];
        return html`<div class="day ${x ? (x.net >= 0 ? 'win' : 'loss') : ''}" ${x ? html`data-day="${d}" role="link" tabindex="0" title="ดูเทรดวันนี้"` : ''}>
          ${Number(d.slice(8))}${x ? html`<b>${signed(x.net, 0)}</b>${x.count} ไม้` : ''}</div>`;
      })}
    </div>`);

  box.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
    const step = Number(b.dataset.step);
    if (step === 0) calMonth = null;
    else {
      const d = new Date(Date.UTC(y, m - 1 + step, 1));
      calMonth = { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 };
    }
    drawCalendar(view, all, tz, cur);
  }));
  box.querySelectorAll('[data-day]').forEach((el) => {
    const go = () => { location.hash = `#/trades?day=${el.dataset.day}`; };
    el.addEventListener('click', go);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  });
}
