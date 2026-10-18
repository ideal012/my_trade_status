import { html, raw, setHtml, state, account, loadTrades, num, signed, tone, pct } from '../lib/ui.js';
import { dayKey } from '../lib/time.js';
import { stats, netPnl, rangeBounds, inRange } from '../lib/calc.js';
import { RANGES, readRange, writeRange, rangeFilter } from '../lib/range.js';

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
      <div class="row" id="range">
        ${RANGES.map(([k, text]) => html`<button class="seg ${sel.kind === k ? 'active' : ''}" data-kind="${k}">${text}</button>`)}
        ${sel.kind === 'custom' ? html`
          <input type="date" id="from" value="${sel.from ?? ''}" style="width:auto">
          <span>ถึง</span>
          <input type="date" id="to" value="${sel.to ?? ''}" style="width:auto">` : ''}
      </div>
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
    <div id="charts"></div>`);

  const again = () => render(view);
  view.querySelector('#range').addEventListener('click', (e) => {
    const b = e.target.closest('[data-kind]');
    if (!b) return;
    writeRange({ ...sel, kind: b.dataset.kind });
    again();
  });
  for (const id of ['from', 'to']) {
    view.querySelector(`#${id}`)?.addEventListener('change', (e) => { writeRange({ ...sel, [id]: e.target.value || null }); again(); });
  }
}
