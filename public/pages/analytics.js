import { html, raw, setHtml, state, account, maxRisk, loadTrades, num, signed, tone, pct, makeChart, COLORS } from '../lib/ui.js';
import { hourOf, weekdayOf } from '../lib/time.js';
import { groupBy, inRange, session, isOpen, riskPcts } from '../lib/calc.js';
import { readRange, rangeFilter, rangeBar, bindRangeBar } from '../lib/range.js';

const WEEKDAYS = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];
const SESSIONS = ['Asia', 'London', 'London/NY', 'New York'];
const NONE = 'ไม่ระบุ';

const stratName = (t) => state.strategies.find((s) => s.id === t.strategy_id)?.name ?? 'ไม่ระบุกลยุทธ์';
function checklistState(t) {
  const total = state.strategies.find((s) => s.id === t.strategy_id)?.checklist.length;
  if (!total) return 'ไม่มี checklist';
  return t.checklist_done.length >= total ? 'ทำ checklist ครบ' : 'ทำไม่ครบ';
}

// Each tab: how to group, how to order the groups (fixed order, or by net P/L), and an optional note.
const TABS = (tz, risk) => [
  { id: 'symbol', label: 'คู่เงิน', key: (t) => t.symbol },
  { id: 'session', label: 'Session', key: (t) => session(t.open_time_utc), order: SESSIONS, note: 'แบ่งจากเวลาเปิดไม้ (UTC): Asia 21–07, London 07–12, London/NY 12–16, New York 16–21' },
  { id: 'weekday', label: 'วันในสัปดาห์', key: (t) => WEEKDAYS[weekdayOf(t.open_time_utc, tz)], order: WEEKDAYS },
  { id: 'hour', label: 'ชั่วโมง', key: (t) => `${String(hourOf(t.open_time_utc, tz)).padStart(2, '0')}:00`, order: Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`), note: `ชั่วโมงที่เปิดไม้ ตามโซนเวลา ${tz}` },
  { id: 'strategy', label: 'กลยุทธ์', key: stratName },
  { id: 'checklist', label: 'ทำตามกฎ', key: checklistState, order: ['ทำ checklist ครบ', 'ทำไม่ครบ', 'ไม่มี checklist'], note: 'เทียบผลของไม้ที่ติ๊ก checklist ครบ กับไม้ที่ทำไม่ครบ' },
  { id: 'risk', label: 'ตามกฎความเสี่ยง', key: (t) => { const p = risk.get(t.id); return p == null ? 'คำนวณไม่ได้ (ไม่มี SL)' : p > maxRisk() ? 'เสี่ยงเกินกฎ' : 'อยู่ในกฎ'; }, order: ['อยู่ในกฎ', 'เสี่ยงเกินกฎ', 'คำนวณไม่ได้ (ไม่มี SL)'], note: `กฎ: เสี่ยงไม่เกิน ${maxRisk()}% ของทุนต่อไม้ (ตั้งได้ในหน้า ตั้งค่า)` },
  { id: 'tag', label: 'Tag', key: (t) => t.tags, note: 'ไม้หนึ่งมีได้หลาย tag จึงนับซ้ำในหลายกลุ่ม ผลรวมอาจมากกว่ากำไรรวม' },
  { id: 'emotion', label: 'อารมณ์', key: (t) => t.emotion || NONE },
  { id: 'direction', label: 'Buy vs Sell', key: (t) => (t.direction === 'buy' ? 'Buy' : 'Sell') },
];

let tabId = 'symbol';

export async function render(view) {
  const tz = state.settings.timezone;
  const sel = readRange();
  const { bounds, label } = rangeFilter(sel, tz);
  const loaded = await loadTrades();
  const trades = loaded.filter((t) => !isOpen(t) && inRange(t, bounds, tz));
  const tabs = TABS(tz, riskPcts(loaded, account().initial_capital));
  const tab = tabs.find((x) => x.id === tabId) ?? tabs[0];

  let rows = groupBy(trades, tab.key);
  rows = tab.order
    ? rows.sort((a, b) => tab.order.indexOf(a.key) - tab.order.indexOf(b.key))
    : rows.sort((a, b) => b.net - a.net);

  setHtml(view, html`
    <div class="page-head">
      <div><h1>วิเคราะห์</h1><p class="sub">${label} · ${trades.length} ไม้ · ดูว่าอะไรทำเงิน อะไรทำให้เสียเงิน</p></div>
      ${rangeBar(sel)}
    </div>
    <div class="tabs">${tabs.map((x) => html`<button class="seg ${x.id === tab.id ? 'active' : ''}" data-tab="${x.id}">${x.label}</button>`)}</div>
    ${rows.length ? html`
      ${tab.note ? html`<p class="sub">${tab.note}</p>` : ''}
      <div class="card"><div class="chart-box"><canvas id="bars" role="img" aria-label="กราฟแท่งกำไรสุทธิแยกตามกลุ่มที่เลือก (ตัวเลขเดียวกันอยู่ในตารางด้านล่าง)"></canvas></div></div>
      <div class="card table-wrap">
        <table>
          <thead><tr><th>${tab.label}</th><th class="num">จำนวนไม้</th><th class="num">Winrate</th><th class="num">กำไรสุทธิ</th><th class="num">เฉลี่ย/ไม้</th><th class="num">R เฉลี่ย</th></tr></thead>
          <tbody>${rows.map((r) => html`<tr>
            <td><b>${r.key}</b></td><td class="num">${r.count}</td><td class="num">${pct(r.winrate)}</td>
            <td class="num ${tone(r.net)}"><b>${signed(r.net)}</b></td>
            <td class="num ${tone(r.avgNet)}">${signed(r.avgNet)}</td>
            <td class="num ${tone(r.avgR)}">${r.avgR == null ? '—' : signed(r.avgR)}</td></tr>`)}</tbody>
        </table>
      </div>` : html`<div class="card empty">ยังไม่มีข้อมูลในช่วงนี้ — เพิ่มเทรดหรือเปลี่ยนช่วงเวลา</div>`}`);

  if (rows.length) {
    makeChart(view.querySelector('#bars'), {
      type: 'bar',
      data: {
        labels: rows.map((r) => r.key),
        datasets: [{ label: 'กำไรสุทธิ', data: rows.map((r) => r.net), backgroundColor: rows.map((r) => (r.net >= 0 ? COLORS.pos : COLORS.neg)) }],
      },
      options: {
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (i) => `สุทธิ ${signed(i.parsed.y)} · ${rows[i.dataIndex].count} ไม้ · Winrate ${pct(rows[i.dataIndex].winrate)}` } } },
        scales: { y: { ticks: { callback: (v) => num(v, 0) } } },
      },
    });
  }

  bindRangeBar(view, sel, () => render(view));
  view.querySelector('.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) { tabId = b.dataset.tab; render(view); }
  });
}
