import { html, raw, setHtml, state, account, api, maxRisk, loadTrades, num, signed, tone, pct, makeChart, COLORS } from '../lib/ui.js';
import { hourOf, weekdayOf } from '../lib/time.js';
import { groupBy, inRange, session, isOpen, riskPcts, MIN_SAMPLE, holdingStats, maeR, mfeR } from '../lib/calc.js';

const dur = (d) => (d == null ? '—' : d < 1 ? `${num(d * 24, 0)} ชม.` : `${num(d, 1)} วัน`);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
import { readRange, rangeFilter, rangeBar, bindRangeBar } from '../lib/range.js';

const WEEKDAYS = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];
const SESSIONS = ['Asia', 'London', 'London/NY', 'New York'];
const NONE = 'ไม่ระบุ';
const KIND_ORDER = ['backtest', 'replay', 'demo', 'live'];
const kindOf = (t) => state.accounts.find((a) => a.id === t.account_id)?.kind ?? 'live';

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
  {
    id: 'kind', label: 'Backtest → Live', allAccounts: true,
    key: (t) => `${stratName(t)} · ${kindOf(t)}`,
    order: [...state.strategies.map((s) => s.name), 'ไม่ระบุกลยุทธ์'].flatMap((n) => KIND_ORDER.map((k) => `${n} · ${k}`)),
    note: 'รวมทุกบัญชี แยกกลยุทธ์ตามประเภทบัญชี (ตั้งได้ในหน้า ตั้งค่า) — ถ้า live แย่กว่า backtest มาก ปัญหามักอยู่ที่การ execute ไม่ใช่ตัวระบบ · เลือกช่วง "ทั้งหมด" เพื่อรวมไม้ backtest ย้อนหลัง',
  },
];

let tabId = 'symbol';

export async function render(view) {
  const tz = state.settings.timezone;
  const sel = readRange();
  const { bounds, label } = rangeFilter(sel, tz);
  const [loaded, flows] = await Promise.all([loadTrades(), api(`/api/cashflows?account_id=${state.accountId}`)]);
  const tabs = TABS(tz, riskPcts(loaded, account().initial_capital, flows));
  const tab = tabs.find((x) => x.id === tabId) ?? tabs[0];
  const source = tab.allAccounts ? await api('/api/trades') : loaded;
  const trades = source.filter((t) => !isOpen(t) && inRange(t, bounds, tz));

  const hold = holdingStats(trades);
  const maes = trades.map(maeR).filter((x) => x != null);
  const mfes = trades.map(mfeR).filter((x) => x != null);
  let rows = groupBy(trades, tab.key);
  rows = tab.order
    ? rows.sort((a, b) => tab.order.indexOf(a.key) - tab.order.indexOf(b.key))
    : rows.sort((a, b) => b.net - a.net);

  setHtml(view, html`
    <div class="page-head">
      <div><h1>วิเคราะห์</h1><p class="sub">${label} · ${trades.length} ไม้ · ดูว่าอะไรทำเงิน อะไรทำให้เสียเงิน</p></div>
      ${rangeBar(sel)}
    </div>
    <div class="grid mini">
      <div class="card stat"><div class="label">ไม้ชนะถือ (มัธยฐาน · p90)</div><div class="value">${dur(hold.win.median)}</div><div class="hint">p90 ${dur(hold.win.p90)} · ${hold.win.count} ไม้</div></div>
      <div class="card stat"><div class="label">ไม้แพ้ถือ (มัธยฐาน · p90)</div><div class="value">${dur(hold.loss.median)}</div><div class="hint">p90 ${dur(hold.loss.p90)} · ${hold.loss.count} ไม้</div></div>
      <div class="card stat"><div class="label">MAE เฉลี่ย (ราคาวิ่งสวน)</div><div class="value">${maes.length ? `${num(mean(maes))}R` : '—'}</div><div class="hint">${maes.length ? `${maes.length} ไม้ที่กรอก MAE` : 'กรอก MAE ในฟอร์มเทรด'}</div></div>
      <div class="card stat"><div class="label">MFE เฉลี่ย (ราคาวิ่งไปทางกำไร)</div><div class="value">${mfes.length ? `${num(mean(mfes))}R` : '—'}</div><div class="hint">${mfes.length ? `${mfes.length} ไม้ที่กรอก MFE` : 'กรอก MFE ในฟอร์มเทรด'}</div></div>
    </div>
    <div class="tabs">${tabs.map((x) => html`<button class="seg ${x.id === tab.id ? 'active' : ''}" data-tab="${x.id}">${x.label}</button>`)}</div>
    ${rows.length ? html`
      ${tab.note ? html`<p class="sub">${tab.note}</p>` : ''}
      <p class="sub">SQN = √จำนวนไม้ × R เฉลี่ย ÷ SD ของ R (เท่ากับ t-stat) — ตั้งแต่ 2 ขึ้นไปถือว่า edge เริ่มน่าเชื่อ · กลุ่มที่มีไม่ถึง ${MIN_SAMPLE} ไม้แสดงเป็นสีจาง</p>
      <div class="card"><div class="chart-box"><canvas id="bars" role="img" aria-label="กราฟแท่งกำไรสุทธิแยกตามกลุ่มที่เลือก (ตัวเลขเดียวกันอยู่ในตารางด้านล่าง)"></canvas></div></div>
      <div class="card table-wrap">
        <table>
          <thead><tr><th>${tab.label}</th><th class="num">จำนวนไม้</th><th class="num">Winrate</th><th class="num">กำไรสุทธิ</th><th class="num">เฉลี่ย/ไม้</th><th class="num">R เฉลี่ย</th><th class="num">PF</th><th class="num">SQN</th></tr></thead>
          <tbody>${rows.map((r) => html`<tr class="${r.small ? 'thin' : ''}">
            <td><b>${r.key}</b>${r.small ? html`<span class="pill muted">ข้อมูลยังน้อย</span>` : ''}</td><td class="num">${r.count}</td><td class="num">${pct(r.winrate)}</td>
            <td class="num ${tone(r.net)}"><b>${signed(r.net)}</b></td>
            <td class="num ${tone(r.avgNet)}">${signed(r.avgNet)}</td>
            <td class="num ${tone(r.avgR)}">${r.avgR == null ? '—' : signed(r.avgR)}</td>
            <td class="num">${r.profitFactor == null ? '—' : num(r.profitFactor)}</td>
            <td class="num ${tone(r.sqn)}">${r.sqn == null ? '—' : num(r.sqn)}</td></tr>`)}</tbody>
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
