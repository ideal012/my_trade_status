import { html, raw, setHtml, state, account, api, maxRisk, loadTrades, num, signed, tone, price } from '../lib/ui.js';
import { fmtTime, dayKey } from '../lib/time.js';
import { netPnl, pips, plannedRR, realizedR, session, isOpen, riskPcts, stats } from '../lib/calc.js';
import { openTradeForm } from '../lib/trade-form.js';

const strategyName = (t) => state.strategies.find((s) => s.id === t.strategy_id)?.name ?? '—';
function checklistText(t) {
  const total = state.strategies.find((s) => s.id === t.strategy_id)?.checklist.length;
  return total ? `${Math.min(t.checklist_done.length, total)}/${total}` : '—';
}

export async function render(view, { query }) {
  const tz = state.settings.timezone;
  const day = query.get('day');
  const [all, flows] = await Promise.all([loadTrades(), api(`/api/cashflows?account_id=${state.accountId}`)]);
  const symbolFilter = (query.get('symbol') ?? '').toUpperCase();
  const trades = all.filter((t) => (!day || (!isOpen(t) && dayKey(t.close_time_utc, tz) === day))
    && (!symbolFilter || t.symbol.includes(symbolFilter)));

  const openCount = trades.filter(isOpen).length;
  const sum = stats(trades, 0); // summary of what the table shows (closed trades only)
  const risk = riskPcts(all, account().initial_capital, flows);
  const equity = stats(all, account().initial_capital, flows).equity;
  const riskCell = (t) => {
    const p = risk.get(t.id);
    if (p == null) return '—';
    return p > maxRisk() ? html`<span class="neg"><b>${num(p)}%</b></span> <span class="badge sell">เกินกฎ</span>` : `${num(p)}%`;
  };

  const row = (t) => html`
    <tr class="clickable" data-id="${t.id}" tabindex="0" role="button" aria-label="แก้ไขเทรด ${t.symbol}">
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
      <td class="num">${riskCell(t)}</td>
      <td>${session(t.open_time_utc)}</td>
      <td>${strategyName(t)}</td>
      <td>${checklistText(t)}</td>
      <td>${t.screenshots.length ? `${t.screenshots.length} รูป` : ''}</td>
      <td class="num ${tone(netPnl(t))}">${isOpen(t) ? html`<span class="badge muted">เปิดอยู่</span>` : html`<b>${signed(netPnl(t))}</b>`}</td>
    </tr>`;

  setHtml(view, html`
    <div class="page-head">
      <div>
        <h1>รายการเทรด</h1>
        <p class="sub">${trades.length} ไม้${openCount ? ` · เปิดอยู่ ${openCount}` : ''}${day ? ` · ปิดวันที่ ${day}` : ''} · เวลาตามโซน ${tz}</p>
      </div>
      <button class="primary" id="add">+ เพิ่มเทรด</button>
    </div>
    <div class="grid mini">
      <div class="card stat"><div class="label">ไม้ที่แสดง</div><div class="value">${trades.length - openCount}</div></div>
      <div class="card stat"><div class="label">ชนะ / แพ้</div><div class="value"><span class="pos">${sum.wins}</span> / <span class="neg">${sum.losses}</span></div></div>
      <div class="card stat"><div class="label">Winrate</div><div class="value">${sum.winrate == null ? '—' : `${num(sum.winrate, 1)}%`}</div></div>
      <div class="card stat"><div class="label">กำไรสุทธิ</div><div class="value ${tone(sum.net)}">${signed(sum.net)}</div></div>
    </div>
    <div class="toolbar">
      <input id="symbol-filter" aria-label="ค้นหาคู่เงิน" placeholder="ค้นหาคู่เงิน เช่น EURUSD" value="${symbolFilter}">
      ${day ? html`<a class="btn" href="#/trades">ล้างตัวกรองวัน</a>` : ''}
    </div>
    <div class="card table-wrap">
      ${trades.length ? html`
        <table>
          <thead><tr>
            <th>เวลาเปิด</th><th>คู่เงิน</th><th>ทิศทาง</th><th class="num">Lot</th>
            <th class="num">Entry</th><th class="num">SL</th><th class="num">TP</th><th class="num">Exit</th>
            <th class="num">Pips</th><th class="num">RR แผน</th><th class="num">R จริง</th><th class="num">เสี่ยง %</th><th>Session</th><th>กลยุทธ์</th><th>Checklist</th><th>รูป</th>
            <th class="num">สุทธิ</th>
          </tr></thead>
          <tbody>${trades.map(row)}</tbody>
        </table>` : html`<div class="empty">${all.length ? 'ไม่พบเทรดที่ตรงกับตัวกรอง' : 'ยังไม่มีเทรด — กด "+ เพิ่มเทรด" เพื่อบันทึกไม้แรกของคุณ'}</div>`}
    </div>`);

  const again = () => render(view, { query });
  view.querySelector('#add').addEventListener('click', () => openTradeForm(null, again, equity));
  view.querySelector('#symbol-filter').addEventListener('change', (e) => {
    const q = new URLSearchParams(query);
    e.target.value.trim() ? q.set('symbol', e.target.value.trim()) : q.delete('symbol');
    location.hash = `#/trades?${q}`;
  });
  const openRow = (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) openTradeForm(all.find((t) => t.id === Number(tr.dataset.id)), again, equity);
  };
  view.querySelector('tbody')?.addEventListener('click', openRow);
  view.querySelector('tbody')?.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRow(e); } });
}
