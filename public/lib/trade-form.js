import { html, raw, state, api, toast, armDelete, num, signed, maxRisk } from './ui.js';
import { localToUtc, toLocal } from './time.js';
import { pips, plannedRR, realizedR, netPnl, riskMoney } from './calc.js';

const EMOTIONS = ['มั่นใจ', 'ปกติ', 'ลังเล', 'กลัว', 'โลภ', 'รีบ', 'แก้แค้นตลาด', 'เบื่อ'];
const SYMBOLS = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD', 'EURJPY', 'GBPJPY'];

const field = (label, name, { type = 'number', value = '', required = false, attrs = '', wide = false } = {}) => html`
  <label class="${wide ? 'wide' : ''}">${label}
    <input name="${name}" type="${type}" value="${value ?? ''}" ${raw(type === 'number' ? 'step="any" inputmode="decimal"' : '')} ${raw(required ? 'required' : '')} ${raw(attrs)}>
  </label>`;

// Opens the add/edit dialog. trade = null for a new trade. onSaved runs after a successful save.
// equity: current account equity, used to preview the risk as a % of capital.
export function openTradeForm(trade, onSaved, equity) {
  const tz = state.settings.timezone;
  const t = trade ?? {};
  // active strategies, plus the trade's own even if archived
  const strategies = state.strategies.filter((st) => !st.archived || st.id === t.strategy_id);
  const nowLocal = toLocal(new Date().toISOString(), tz);
  const dlg = document.createElement('dialog');
  dlg.innerHTML = html`
    <form method="dialog" novalidate>
      <h2>${trade ? 'แก้ไขเทรด' : 'เพิ่มเทรด'} <small class="sub">(เวลาตามโซน ${tz})</small></h2>
      <div class="form-error" hidden></div>

      <fieldset><legend>① ข้อมูลออเดอร์</legend>
        <div class="fields">
          <label>คู่เงิน / สินค้า
            <input name="symbol" list="symbols" value="${t.symbol ?? ''}" required autocomplete="off" placeholder="EURUSD">
            <datalist id="symbols">${SYMBOLS.map((s) => html`<option value="${s}">`)}</datalist>
          </label>
          <label>ทิศทาง
            <select name="direction" required>
              <option value="buy" ${raw(t.direction !== 'sell' ? 'selected' : '')}>Buy (ซื้อ)</option>
              <option value="sell" ${raw(t.direction === 'sell' ? 'selected' : '')}>Sell (ขาย)</option>
            </select>
          </label>
          ${field('ขนาด Lot', 'lot', { value: t.lot, required: true })}
          ${field('ราคาเข้า (Entry)', 'entry_price', { value: t.entry_price, required: true })}
          ${field('Stop Loss (SL)', 'sl', { value: t.sl })}
          ${field('Take Profit (TP)', 'tp', { value: t.tp })}
          ${field('SL เริ่มต้น — กรอกถ้าเลื่อน SL ภายหลัง (R คิดจากค่านี้)', 'initial_sl', { value: t.initial_sl })}
          ${field('เวลาเปิด', 'open_time', { type: 'datetime-local', value: t.open_time_utc ? toLocal(t.open_time_utc, tz) : nowLocal, required: true })}
          ${field('Ticket (ถ้ามี)', 'ticket', { type: 'text', value: t.ticket })}
          ${field('ความเสี่ยง ($) ถ้าโดน SL — เว้นว่างให้คำนวณจากผลไม้', 'risk_amount', { value: t.risk_amount })}
        </div>
      </fieldset>

      <fieldset><legend>② ผลลัพธ์</legend>
        <p class="sub" style="margin:0 0 8px">ยังไม่ปิดไม้? เว้นราคาออก เวลาปิด และกำไรไว้ก่อน แล้วกลับมาแก้ตอนปิด</p>
        <div class="fields">
          ${field('MAE — ราคาที่แย่ที่สุดระหว่างถือ (ไม่บังคับ)', 'mae', { value: t.mae })}
          ${field('MFE — ราคาที่ดีที่สุดระหว่างถือ (ไม่บังคับ)', 'mfe', { value: t.mfe })}
        </div>
        <div class="fields">
          ${field('ราคาออก (Exit)', 'exit_price', { value: t.exit_price })}
          ${field('เวลาปิด', 'close_time', { type: 'datetime-local', value: t.close_time_utc ? toLocal(t.close_time_utc, tz) : '' })}
          ${field('กำไร/ขาดทุน (ไม่รวมค่าธรรมเนียม)', 'profit', { value: t.profit })}
          <label>&nbsp;<button type="button" data-act="close-now">เวลาปิด = ตอนนี้</button></label>
          ${field('Commission (ใส่ติดลบ)', 'commission', { value: t.commission ?? 0 })}
          ${field('Swap', 'swap', { value: t.swap ?? 0 })}
        </div>
      </fieldset>

      <fieldset><legend>③ กลยุทธ์และ checklist</legend>
        <label>กลยุทธ์ที่ใช้
          <select name="strategy_id" id="strategy">
            <option value="">— ไม่ระบุ —</option>
            ${strategies.map((st) => html`<option value="${st.id}" ${raw(st.id === t.strategy_id ? 'selected' : '')}>${st.name}${st.archived ? ' (เก็บถาวร)' : ''}</option>`)}
          </select>
        </label>
        <div class="checklist" id="checklist"></div>
      </fieldset>

      <fieldset><legend>④ โน้ตและอารมณ์</legend>
        <div class="fields">
          ${field('Tag (คั่นด้วย , เช่น news, A+)', 'tags', { type: 'text', value: (t.tags ?? []).join(', ') })}
          <label>อารมณ์ตอนเทรด
            <select name="emotion">
              <option value="">— ไม่ระบุ —</option>
              ${EMOTIONS.map((e) => html`<option ${raw(e === t.emotion ? 'selected' : '')}>${e}</option>`)}
            </select>
          </label>
          <label class="wide">โน้ต / เหตุผลที่เข้า / บทเรียน
            <textarea name="notes">${t.notes ?? ''}</textarea>
          </label>
        </div>
      </fieldset>

      <fieldset><legend>⑤ รูป screenshot กราฟ</legend>
        <div class="shots" id="shots"></div>
        <label>เพิ่มรูป (PNG / JPG / WebP ไม่เกิน 10 MB) หรือกด Ctrl+V เพื่อวางรูปจาก clipboard
          <input type="file" id="shot-file" accept="image/png,image/jpeg,image/webp" multiple>
        </label>
      </fieldset>

      <div class="preview" id="preview">กรอก Entry / SL / TP เพื่อดูค่า RR</div>

      <div class="dialog-actions">
        ${trade ? html`<button type="button" class="danger" data-act="delete">ลบเทรดนี้</button>` : html`<span></span>`}
        <span class="row">
          <button type="button" data-act="cancel">ยกเลิก</button>
          <button type="submit" class="primary">บันทึก</button>
        </span>
      </div>
    </form>`.s;
  document.body.append(dlg);
  const form = dlg.querySelector('form');
  const errBox = dlg.querySelector('.form-error');
  const close = () => { dlg.close(); dlg.remove(); };
  dlg.querySelector('[data-act=cancel]').addEventListener('click', close);
  dlg.querySelector('[data-act=close-now]').addEventListener('click', () => {
    form.elements.close_time.value = toLocal(new Date().toISOString(), tz);
  });
  dlg.addEventListener('cancel', () => dlg.remove());

  const del = dlg.querySelector('[data-act=delete]');
  if (del) {
    armDelete(del, async () => {
      await api(`/api/trades/${trade.id}`, { method: 'DELETE' });
      close();
      toast('ลบแล้ว');
      onSaved();
    });
  }

  // checklist follows the chosen strategy; ticks start from the saved state when the strategy is unchanged
  const stSelect = dlg.querySelector('#strategy');
  const ckBox = dlg.querySelector('#checklist');
  const drawChecklist = () => {
    const st = state.strategies.find((x) => x.id === Number(stSelect.value));
    const saved = Number(stSelect.value) === t.strategy_id ? t.checklist_done ?? [] : [];
    ckBox.innerHTML = st?.checklist.length
      ? html`${st.checklist.map((item, i) => html`<label><input type="checkbox" name="ck" value="${i}" ${raw(saved.includes(i) ? 'checked' : '')}> ${item}</label>`)}`.s
      : html`<p class="sub">${st ? 'กลยุทธ์นี้ยังไม่มี checklist' : 'เลือกกลยุทธ์เพื่อดู checklist'}</p>`.s;
  };
  stSelect.addEventListener('change', drawChecklist);
  drawChecklist();

  // screenshots: saved ones can be deleted at once; new ones are uploaded after the trade is saved
  const shotsBox = dlg.querySelector('#shots');
  const pending = [];
  const drawShots = () => {
    shotsBox.innerHTML = html`
      ${(trade?.screenshots ?? []).map((x) => html`<div class="shot">
        <a href="/uploads/${x.filename}" target="_blank" rel="noopener"><img src="/uploads/${x.filename}" alt="${x.caption || 'screenshot'}"></a>
        <small>${x.caption || ' '}</small><button type="button" class="danger" data-del="${x.id}">ลบรูป</button></div>`)}
      ${pending.map((x, i) => html`<div class="shot">
        <img src="${x.url}" alt="รูปใหม่"><input data-cap="${i}" placeholder="คำบรรยาย" value="${x.caption}">
        <button type="button" data-drop="${i}">เอาออก</button></div>`)}`.s;
    shotsBox.querySelectorAll('[data-del]').forEach((b) => armDelete(b, async () => {
      await api(`/api/screenshots/${b.dataset.del}`, { method: 'DELETE' });
      trade.screenshots = trade.screenshots.filter((x) => x.id !== Number(b.dataset.del));
      drawShots();
    }));
    shotsBox.querySelectorAll('[data-drop]').forEach((b) => b.addEventListener('click', () => { pending.splice(Number(b.dataset.drop), 1); drawShots(); }));
    shotsBox.querySelectorAll('[data-cap]').forEach((i) => i.addEventListener('input', () => { pending[Number(i.dataset.cap)].caption = i.value; }));
  };
  const addFiles = (files) => {
    for (const file of files) {
      if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { toast('รองรับเฉพาะรูป PNG, JPG, WebP'); continue; }
      if (file.size > 10 * 1024 * 1024) { toast('รูปใหญ่เกิน 10 MB'); continue; }
      const reader = new FileReader();
      reader.onload = () => {
        pending.push({ mime: file.type, data: String(reader.result).split(',')[1], url: reader.result, caption: '' });
        drawShots();
      };
      reader.readAsDataURL(file);
    }
  };
  dlg.querySelector('#shot-file').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
  dlg.addEventListener('paste', (e) => addFiles([...(e.clipboardData?.files ?? [])]));
  drawShots();

  const preview = dlg.querySelector('#preview');
  const updatePreview = () => {
    const f = Object.fromEntries(new FormData(form));
    const n = (v) => (v === '' || v == null ? null : Number(v));
    const t = {
      symbol: f.symbol || 'EURUSD', direction: f.direction, entry_price: n(f.entry_price),
      sl: n(f.sl), initial_sl: n(f.initial_sl), tp: n(f.tp), exit_price: n(f.exit_price),
      profit: n(f.profit), commission: n(f.commission) ?? 0, swap: n(f.swap) ?? 0, risk_amount: n(f.risk_amount),
    };
    if (t.entry_price == null) return;
    const bits = [];
    const rr = plannedRR(t);
    bits.push(`RR ตามแผน ${rr == null ? '—' : '1 : ' + num(rr)}`);
    const money = riskMoney(t.exit_price != null && t.profit == null ? { ...t, exit_price: null } : t);
    if (money != null) {
      const pct = equity > 0 ? (money / equity) * 100 : null;
      bits.push(`เสี่ยง ${num(money)}${pct == null ? '' : ` (${num(pct)}% ของทุนตอนนี้${pct > maxRisk() ? ' — เกินกฎ!' : ''})`}`);
    }
    if (t.exit_price != null) {
      bits.push(`ผลจริง ${signed(pips(t), 1)} pips`);
      const r = realizedR(t);
      if (r != null) bits.push(`${signed(r)} R`);
      if (t.profit != null) bits.push(`สุทธิ ${signed(netPnl(t))}`);
    }
    preview.textContent = bits.join(' · ');
  };
  form.addEventListener('input', updatePreview);
  updatePreview();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    const body = {
      account_id: state.accountId,
      ticket: f.ticket, symbol: f.symbol, direction: f.direction, lot: f.lot,
      entry_price: f.entry_price, sl: f.sl, initial_sl: f.initial_sl, tp: f.tp, exit_price: f.exit_price,
      open_time_utc: f.open_time ? localToUtc(f.open_time, tz) : '',
      close_time_utc: f.close_time ? localToUtc(f.close_time, tz) : '',
      profit: f.profit, commission: f.commission, swap: f.swap,
      strategy_id: f.strategy_id || null,
      checklist_done: new FormData(form).getAll('ck').map(Number),
      tags: f.tags, emotion: f.emotion, notes: f.notes, risk_amount: f.risk_amount, mae: f.mae, mfe: f.mfe,
    };
    try {
      const saved = await api(trade ? `/api/trades/${trade.id}` : '/api/trades', { method: trade ? 'PUT' : 'POST', body });
      trade = saved; // a failed upload below must not make a retry create the trade twice
      while (pending.length) {
        const x = pending[0];
        await api(`/api/trades/${saved.id}/screenshots`, { method: 'POST', body: { mime: x.mime, data: x.data, caption: x.caption } });
        pending.shift();
      }
      close();
      toast('บันทึกแล้ว');
      onSaved();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.hidden = false;
      errBox.scrollIntoView({ block: 'nearest' });
    }
  });
  dlg.showModal();
  dlg.querySelector('input[name=symbol]').focus();
}
