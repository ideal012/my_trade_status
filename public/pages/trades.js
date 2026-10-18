import { html, raw, setHtml, state, loadTrades, num, signed, tone, price } from '../lib/ui.js';
import { fmtTime, dayKey } from '../lib/time.js';
import { netPnl, pips, plannedRR, realizedR, session } from '../lib/calc.js';
import { openTradeForm } from '../lib/trade-form.js';

const strategyName = (t) => state.strategies.find((s) => s.id === t.strategy_id)?.name ?? '—';
function checklistText(t) {
  const total = state.strategies.find((s) => s.id === t.strategy_id)?.checklist.length;
  return total ? `${Math.min(t.checklist_done.length, total)}/${total}` : '—';
}

export async function render(view, { query }) {
  const tz = state.settings.timezone;
  const day = query.get('day');
  const all = await loadTrades();
  const symbolFilter = (query.get('symbol') ?? '').toUpperCase();
  const trades = all.filter((t) => (!day || dayKey(t.open_time_utc, tz) === day)
    && (!symbolFilter || t.symbol.includes(symbolFilter)));

  const row = (t) => html`
    <tr class="clickable" data-id="${t.id}">
      <td>${fmtTime(t.open_time_utc, tz)}</td>
      <td><b>${t.symbol}</b></td>
      <td><span class="badge ${t.direction}">${t.direction === 'buy' ? 'BUY' : 'SELL'}</span></td>
      <td class="num">${num(t.lot)}</td>
      <td class="num">${price(t.entry_price)}</td>
      <td class="num">${price(t.sl)}</td>
      <td class="num">${price(t.tp)}</td>
      <td class="num">${price(t.exit_price)}</td>
      <td class="num ${tone(pips(t))}">${signed(pips(t), 1)}</td>
      <td class="num">${plannedRR(t) == null ? '—' : num(plannedRR(t))}</td>
      <td class="num ${tone(realizedR(t))}">${realizedR(t) == null ? '—' : signed(realizedR(t))}</td>
      <td>${session(t.open_time_utc)}</td>
      <td>${strategyName(t)}</td>
      <td>${checklistText(t)}</td>
      <td>${t.screenshots.length ? `${t.screenshots.length} รูป` : ''}</td>
      <td class="num ${tone(netPnl(t))}"><b>${signed(netPnl(t))}</b></td>
    </tr>`;

  setHtml(view, html`
    <div class="page-head">
      <div>
        <h1>รายการเทรด</h1>
        <p class="sub">${trades.length} ไม้${day ? ` · วันที่ ${day}` : ''} · เวลาตามโซน ${tz}</p>
      </div>
      <button class="primary" id="add">+ เพิ่มเทรด</button>
    </div>
    <div class="toolbar">
      <input id="symbol-filter" placeholder="ค้นหาคู่เงิน เช่น EURUSD" value="${symbolFilter}">
      ${day ? html`<a class="btn" href="#/trades">ล้างตัวกรองวัน</a>` : ''}
    </div>
    <div class="card table-wrap">
      ${trades.length ? html`
        <table>
          <thead><tr>
            <th>เวลาเปิด</th><th>คู่เงิน</th><th>ทิศทาง</th><th class="num">Lot</th>
            <th class="num">Entry</th><th class="num">SL</th><th class="num">TP</th><th class="num">Exit</th>
            <th class="num">Pips</th><th class="num">RR แผน</th><th class="num">R จริง</th><th>Session</th><th>กลยุทธ์</th><th>Checklist</th><th>รูป</th>
            <th class="num">สุทธิ</th>
          </tr></thead>
          <tbody>${trades.map(row)}</tbody>
        </table>` : html`<div class="empty">${all.length ? 'ไม่พบเทรดที่ตรงกับตัวกรอง' : 'ยังไม่มีเทรด — กด "+ เพิ่มเทรด" เพื่อบันทึกไม้แรกของคุณ'}</div>`}
    </div>`);

  const again = () => render(view, { query });
  view.querySelector('#add').addEventListener('click', () => openTradeForm(null, again));
  view.querySelector('#symbol-filter').addEventListener('change', (e) => {
    const q = new URLSearchParams(query);
    e.target.value.trim() ? q.set('symbol', e.target.value.trim()) : q.delete('symbol');
    location.hash = `#/trades?${q}`;
  });
  view.querySelector('tbody')?.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) openTradeForm(all.find((t) => t.id === Number(tr.dataset.id)), again);
  });
}
