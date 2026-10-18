import { html, setHtml, state, account, maxRisk, loadTrades, num, signed, tone, pct, makeChart, COLORS } from '../lib/ui.js';
import { dayKey, fmtTime, hourOf } from '../lib/time.js';
import { drawRing, drawDaily, drawEmotion, lastTrades } from './dashboard-charts.js';
import { stats, netPnl, inRange, equitySeries, dailyPnl, monthGrid, isOpen, riskPcts, riskSummary } from '../lib/calc.js';
import { readRange, rangeFilter, rangeBar, bindRangeBar } from '../lib/range.js';

const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const DOW = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'];
let calMonth = null; // { y, m } being shown, kept while the user flips between pages

const greeting = (tz) => {
  const h = hourOf(new Date().toISOString(), tz);
  return h < 5 ? 'ดึกแล้ว พักบ้างนะ' : h < 12 ? 'สวัสดีตอนเช้า' : h < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น';
};

const card = (label, value, { cls = '', hint = '', big = false, delta = null } = {}) => html`
  <div class="card stat ${big ? 'big' : ''}">
    <div class="label">${label}${delta == null ? '' : html` <span class="pill ${tone(delta)}">${signed(delta)}%</span>`}</div>
    <div class="value ${cls}">${value}</div>
    <div class="hint">${hint || ' '}</div>
  </div>`;

export async function render(view) {
  const tz = state.settings.timezone;
  const acc = account();
  const loaded = await loadTrades();
  const openCount = loaded.filter(isOpen).length;
  const all = loaded.filter((t) => !isOpen(t)); // statistics count closed trades only
  const sel = readRange();
  const { bounds, label } = rangeFilter(sel, tz);

  const inside = all.filter((t) => inRange(t, bounds, tz));
  // capital at the start of the chosen period = initial capital + everything that closed before it
  const before = bounds?.from ? all.filter((t) => dayKey(t.close_time_utc, tz) < bounds.from) : [];
  const startCapital = acc.initial_capital + before.reduce((s, t) => s + netPnl(t), 0);
  const st = stats(inside, startCapital);
  const now = stats(all, acc.initial_capital);
  const risk = riskSummary(inside, riskPcts(all, acc.initial_capital), maxRisk());
  const cur = acc.currency;

  setHtml(view, html`
    <div class="page-head">
      <div><h1>${greeting(tz)}</h1><p class="sub">ภาพรวม ${acc.name} · ${label} · เวลาตามโซน ${tz}</p></div>
      ${rangeBar(sel)}
    </div>

    ${openCount ? html`<p class="sub">มี <a href="#/trades">${openCount} ไม้ที่ยังเปิดอยู่</a> — ยังไม่นับในสถิติจนกว่าจะปิด</p>` : ''}
    ${all.length ? '' : html`<div class="card empty">ยังไม่มีเทรด — ไปที่ <a href="#/trades">รายการเทรด</a> เพื่อเพิ่มไม้แรก หรือใช้ <a href="#/import">Import</a> จาก MT4/MT5</div>`}

    <div class="grid">
      ${card('กำไรสุทธิ', `${signed(st.net)} ${cur}`, { big: true, cls: tone(st.net), delta: st.growthPct, hint: 'เทียบกับทุนต้นช่วง' })}
      ${card('ทุนปัจจุบัน', `${num(now.equity)} ${cur}`, { big: true, hint: `ทุนเริ่มต้น ${num(acc.initial_capital)} · ทั้งหมด ${signed(now.net)}` })}
      ${card('Winrate', pct(st.winrate), { big: true, hint: `ชนะ ${st.wins} · แพ้ ${st.losses} · จาก ${st.count} ไม้` })}
      ${card('Profit Factor', st.profitFactor == null ? '—' : num(st.profitFactor), { big: true, hint: 'กำไรรวม ÷ ขาดทุนรวม (>1 = กำไร)' })}
    </div>
    <div class="split">
      <div class="card">
        <h2>Equity curve <small class="sub">เส้นทุนหลังปิดแต่ละไม้ · แรเงาแดง = drawdown</small></h2>
        ${st.count ? html`<div class="chart-box"><canvas id="equity"></canvas></div>` : html`<div class="empty">ยังไม่มีเทรดในช่วงนี้</div>`}
      </div>
      <div class="card">
        <h2>สรุปช่วงนี้</h2>
        <ul class="kv">
          <li><span>กำไรเฉลี่ยต่อไม้ชนะ</span><b class="pos">${signed(st.avgWin)}</b></li>
          <li><span>ขาดทุนเฉลี่ยต่อไม้แพ้</span><b class="neg">${signed(st.avgLoss)}</b></li>
          <li><span>R เฉลี่ย<small>เท่าของความเสี่ยง (ต้องมี SL)</small></span><b class="${tone(st.avgR)}">${st.avgR == null ? '—' : signed(st.avgR)}</b></li>
          <li><span>Expectancy ต่อไม้</span><b class="${tone(st.expectancy)}">${signed(st.expectancy)}</b></li>
          <li><span>Max Drawdown<small>${st.count ? `−${num(st.maxDrawdown.pct)}% จากจุดสูงสุด` : ''}</small></span><b class="${st.maxDrawdown.amount ? 'neg' : ''}">${st.count ? `−${num(st.maxDrawdown.amount)}` : '—'}</b></li>
          <li><span>ชนะติดกันสูงสุด</span><b>${st.maxWinStreak} ไม้</b></li>
          <li><span>แพ้ติดกันสูงสุด</span><b>${st.maxLossStreak} ไม้</b></li>
          <li><span>ความเสี่ยงเฉลี่ยต่อไม้<small>กฎ ≤ ${num(maxRisk())}% ของทุน</small></span><b class="${risk.avg > maxRisk() ? 'neg' : ''}">${risk.avg == null ? '—' : `${num(risk.avg)}%`}</b></li>
          <li><span>ไม้ที่เสี่ยงเกินกฎ<small>${risk.known ? `จาก ${risk.known} ไม้ที่คำนวณได้` : 'ต้องมี SL'}</small></span><b class="${risk.over ? 'neg' : 'pos'}">${risk.known ? risk.over : '—'}</b></li>
        </ul>
      </div>
    </div>

    <div class="trio">
      <div class="card">
        <h2>ชนะ / แพ้</h2>
        <div class="donut">
          ${st.count ? html`<canvas id="ring"></canvas>` : ''}
          <div class="center"><b>${pct(st.winrate, 0)}</b><span>Winrate</span></div>
        </div>
        <p class="legend"><span class="pos">● ชนะ ${st.wins}</span> <span class="neg">● แพ้ ${st.losses}</span>${st.count - st.wins - st.losses ? html` <span>● เสมอ ${st.count - st.wins - st.losses}</span>` : ''}</p>
      </div>
      <div class="card">
        <h2>กำไร/ขาดทุนรายวัน <small class="sub">30 วันเทรดล่าสุดในช่วงนี้</small></h2>
        ${st.count ? html`<div class="chart-box short"><canvas id="daily"></canvas></div>` : html`<div class="empty">ยังไม่มีเทรดในช่วงนี้</div>`}
      </div>
      <div class="card">
        <h2>กำไรตามอารมณ์ <small class="sub">ที่ติดไว้ในแต่ละไม้</small></h2>
        <div class="chart-box short"><canvas id="mood"></canvas></div>
        <div class="empty" id="mood-empty" hidden>ยังไม่ได้เลือกอารมณ์ในไม้ไหนเลย — เลือกในฟอร์มเทรดช่อง "อารมณ์ตอนเทรด" เพื่อดูว่าอารมณ์ไหนทำเงิน อารมณ์ไหนเสียเงิน</div>
      </div>
    </div>

    <div class="card table-wrap">
      <div class="page-head" style="margin:14px 20px 4px"><h2>เทรดล่าสุด</h2><a href="#/trades">ดูทั้งหมด →</a></div>
      ${st.count ? html`<table><thead><tr><th>ปิดเมื่อ</th><th>คู่เงิน</th><th>ทิศทาง</th><th class="num">สุทธิ</th><th>กลยุทธ์</th><th>อารมณ์</th></tr></thead>
        <tbody>${lastTrades(inside, 6).map((t) => html`<tr class="clickable" data-day="${dayKey(t.close_time_utc, tz)}">
          <td>${fmtTime(t.close_time_utc, tz)}</td><td><b>${t.symbol}</b></td>
          <td><span class="badge ${t.direction}">${t.direction === 'buy' ? 'BUY' : 'SELL'}</span></td>
          <td class="num ${tone(netPnl(t))}"><b>${signed(netPnl(t))}</b></td>
          <td>${state.strategies.find((s) => s.id === t.strategy_id)?.name ?? '—'}</td><td>${t.emotion || '—'}</td></tr>`)}</tbody></table>`
        : html`<div class="empty">ยังไม่มีเทรดในช่วงนี้</div>`}
    </div>

    <div class="card" id="calendar"></div>`);

  if (st.count) drawEquity(view.querySelector('#equity'), equitySeries(inside, startCapital), tz);
  if (st.count) {
    drawRing(view.querySelector('#ring'), st);
    drawDaily(view.querySelector('#daily'), inside, tz);
  }
  if (!drawEmotion(view.querySelector('#mood'), inside)) {
    view.querySelector('.chart-box:has(#mood)').hidden = true;
    view.querySelector('#mood-empty').hidden = false;
  }
  view.querySelectorAll('tr[data-day]').forEach((tr) => tr.addEventListener('click', () => { location.hash = `#/trades?day=${tr.dataset.day}`; }));
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
        {
          label: 'area', data: series.map((p) => p.equity), borderWidth: 0, pointRadius: 0, tension: 0.15, fill: 'origin',
          backgroundColor: (ctx) => {
            const { chart } = ctx;
            if (!chart.chartArea) return 'transparent';
            const g = chart.ctx.createLinearGradient(0, chart.chartArea.top, 0, chart.chartArea.bottom);
            g.addColorStop(0, COLORS.accentSoft);
            g.addColorStop(1, 'transparent');
            return g;
          },
        },
        { label: 'จุดสูงสุดเดิม', data: peaks, borderColor: COLORS.muted, borderDash: [4, 4], borderWidth: 1, pointRadius: 0, fill: false },
        {
          label: 'Equity', data: series.map((p) => p.equity), borderColor: COLORS.accent, borderWidth: 2,
          pointRadius: series.length < 40 ? 3 : 0, tension: 0.15, fill: '-1', backgroundColor: COLORS.negSoft,
        },
      ],
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { filter: (item) => item.text !== 'area' } },
        filler: { propagate: false },
        tooltip: {
          callbacks: {
            title: (items) => { const p = series[items[0].dataIndex]; return p.t ? `${items[0].label} · ${fmtTime(p.t, tz)}` : 'ทุนเริ่มต้นของช่วงนี้'; },
            label: (item) => (item.dataset.label === 'area' ? null : `${item.dataset.label}: ${num(item.parsed.y)}`),
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
    if (st.count) {
    drawRing(view.querySelector('#ring'), st);
    drawDaily(view.querySelector('#daily'), inside, tz);
  }
  if (!drawEmotion(view.querySelector('#mood'), inside)) {
    view.querySelector('.chart-box:has(#mood)').hidden = true;
    view.querySelector('#mood-empty').hidden = false;
  }
  view.querySelectorAll('tr[data-day]').forEach((tr) => tr.addEventListener('click', () => { location.hash = `#/trades?day=${tr.dataset.day}`; }));
  drawCalendar(view, all, tz, cur);
  }));
  box.querySelectorAll('[data-day]').forEach((el) => {
    const go = () => { location.hash = `#/trades?day=${el.dataset.day}`; };
    el.addEventListener('click', go);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  });
}
