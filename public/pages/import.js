import { html, raw, setHtml, state, account, api, loadTrades, num, signed, tone, toast } from '../lib/ui.js';
import { fmtTime } from '../lib/time.js';
import { decodeReport, parseReport } from '../lib/import-mt.js';
import { netPnl } from '../lib/calc.js';

const OFFSETS = Array.from({ length: 27 }, (_, i) => i - 12); // GMT-12 .. GMT+14

export async function render(view) {
  const tz = state.settings.timezone;
  const acc = account();
  const existing = new Set((await loadTrades()).map((t) => t.ticket).filter(Boolean));
  let text = null; // decoded file, kept so the broker time setting can be changed without re-choosing the file

  setHtml(view, html`
    <div class="page-head"><div><h1>Import จาก MT4 / MT5</h1>
      <p class="sub">นำเข้าเข้าบัญชี <b>${acc.name}</b> (เปลี่ยนบัญชีได้ที่มุมขวาบน) · ไฟล์เดิมนำเข้าซ้ำได้ ระบบข้ามไม้ที่มี ticket อยู่แล้ว</p></div></div>

    <div class="card">
      <h2>วิธีเอาไฟล์จากโปรแกรมเทรด</h2>
      <p><b>MT5:</b> แท็บ <i>History</i> (ประวัติบัญชี) → เลือกช่วงเวลา → คลิกขวา → <i>Report</i> → <i>HTML</i> (ใช้ตาราง Positions)</p>
      <p><b>MT4:</b> แท็บ <i>Account History</i> → เลือกช่วงเวลา → คลิกขวา → <i>Save as Detailed Report</i> (ใช้ตาราง Closed Transactions)</p>
    </div>

    <div class="card">
      <div class="fields">
        <label>เวลาใน report เป็นเวลาของเซิร์ฟเวอร์โบรกเกอร์ — เลือกให้ตรง
          <select id="offset">
            <option value="ny">GMT+2 / GMT+3 (เปลี่ยนตามเวลาออมแสงสหรัฐ) — โบรกส่วนใหญ่</option>
            ${OFFSETS.map((h) => html`<option value="${h}">คงที่ GMT${h >= 0 ? '+' : '−'}${Math.abs(h)}</option>`)}
          </select>
        </label>
        <label>ไฟล์ report (.htm / .html)
          <input type="file" id="file" accept=".htm,.html,text/html">
        </label>
      </div>
    </div>
    <div id="result"></div>`);

  const result = view.querySelector('#result');
  const offsetSel = view.querySelector('#offset');

  function show() {
    if (text === null) return;
    const offset = offsetSel.value === 'ny' ? 'ny' : Number(offsetSel.value);
    let parsed;
    try {
      parsed = parseReport(text, offset);
    } catch (err) {
      setHtml(result, html`<div class="card form-error">${err.message}</div>`);
      return;
    }
    const fresh = parsed.trades.filter((t) => !existing.has(t.ticket));
    const rows = parsed.trades.map((t) => html`<tr>
      <td>${t.ticket}</td><td><b>${t.symbol}</b></td><td><span class="badge ${t.direction}">${t.direction.toUpperCase()}</span></td>
      <td class="num">${num(t.lot)}</td><td class="num">${t.entry_price}</td><td class="num">${t.exit_price}</td>
      <td>${fmtTime(t.open_time_utc, tz)}</td>
      <td class="num ${tone(netPnl(t))}"><b>${signed(netPnl(t))}</b></td>
      <td>${existing.has(t.ticket) ? html`<span class="badge muted">ซ้ำ (ข้าม)</span>` : html`<span class="badge buy">ใหม่</span>`}</td></tr>`);

    setHtml(result, html`
      <div class="card">
        <h2>ตัวอย่างก่อนนำเข้า · ${parsed.kind.toUpperCase()}</h2>
        <p>พบ <b>${parsed.trades.length}</b> ไม้ — ใหม่ <b>${fresh.length}</b> · ซ้ำ ${parsed.trades.length - fresh.length}
          ${parsed.errors.length ? html` · <span class="neg">อ่านไม่ได้ ${parsed.errors.length} แถว</span>` : ''}</p>
        <p class="sub">ตรวจดูว่าราคา เวลา และกำไรของไม้แรก ๆ ตรงกับในโปรแกรมเทรด ถ้าเวลาเลื่อนผิด ให้เปลี่ยนตัวเลือกเวลาเซิร์ฟเวอร์ด้านบน (แสดงเวลาตามโซน ${tz})</p>
        ${parsed.errors.length ? html`<div class="form-error">${parsed.errors.map((e) => html`<div>${e}</div>`)}</div>` : ''}
        <div class="table-wrap">${parsed.trades.length ? html`<table>
          <thead><tr><th>Ticket</th><th>คู่เงิน</th><th>ทิศทาง</th><th class="num">Lot</th><th class="num">Entry</th><th class="num">Exit</th><th>เวลาเปิด</th><th class="num">สุทธิ</th><th></th></tr></thead>
          <tbody>${rows}</tbody></table>` : html`<div class="empty">ไม่พบไม้ที่ปิดแล้วในไฟล์นี้</div>`}</div>
        <div class="row" style="margin-top:14px">
          <button class="primary" id="go" ${raw(fresh.length ? '' : 'disabled')}>นำเข้า ${fresh.length} ไม้ใหม่</button>
        </div>
      </div>`);

    result.querySelector('#go')?.addEventListener('click', async (e) => {
      e.target.disabled = true;
      try {
        const r = await api('/api/trades/import', { method: 'POST', body: { account_id: state.accountId, trades: parsed.trades } });
        toast(`นำเข้า ${r.inserted} ไม้แล้ว`);
        setHtml(result, html`<div class="card"><h2>นำเข้าเสร็จแล้ว</h2><p>เพิ่ม <b>${r.inserted}</b> ไม้ · ข้ามที่ซ้ำ ${r.skipped} ไม้</p>
          <p><a class="btn" href="#/trades">ดูรายการเทรด</a> <a class="btn" href="#/dashboard">ดูภาพรวม</a></p></div>`);
      } catch (err) {
        e.target.disabled = false;
        setHtml(result, html`<div class="card form-error">${err.message}</div>`);
      }
    });
  }

  offsetSel.addEventListener('change', show);
  view.querySelector('#file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) { setHtml(result, html`<div class="card form-error">ไฟล์ใหญ่เกิน 50 MB</div>`); return; }
    text = decodeReport(await file.arrayBuffer());
    show();
  });
}
