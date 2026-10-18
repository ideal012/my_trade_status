import { html, raw, state, api, toast, armDelete, num, signed } from './ui.js';
import { localToUtc, toLocal } from './time.js';
import { pips, plannedRR, realizedR, netPnl } from './calc.js';

const SYMBOLS = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD', 'EURJPY', 'GBPJPY'];

const field = (label, name, { type = 'number', value = '', required = false, attrs = '', wide = false } = {}) => html`
  <label class="${wide ? 'wide' : ''}">${label}
    <input name="${name}" type="${type}" value="${value ?? ''}" ${raw(type === 'number' ? 'step="any" inputmode="decimal"' : '')} ${raw(required ? 'required' : '')} ${raw(attrs)}>
  </label>`;

// Opens the add/edit dialog. trade = null for a new trade. onSaved runs after a successful save.
export function openTradeForm(trade, onSaved) {
  const tz = state.settings.timezone;
  const t = trade ?? {};
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
          ${field('เวลาเปิด', 'open_time', { type: 'datetime-local', value: t.open_time_utc ? toLocal(t.open_time_utc, tz) : nowLocal, required: true })}
          ${field('Ticket (ถ้ามี)', 'ticket', { type: 'text', value: t.ticket })}
        </div>
      </fieldset>

      <fieldset><legend>② ผลลัพธ์</legend>
        <div class="fields">
          ${field('ราคาออก (Exit)', 'exit_price', { value: t.exit_price, required: true })}
          ${field('เวลาปิด', 'close_time', { type: 'datetime-local', value: t.close_time_utc ? toLocal(t.close_time_utc, tz) : nowLocal, required: true })}
          ${field('กำไร/ขาดทุน (ไม่รวมค่าธรรมเนียม)', 'profit', { value: t.profit, required: true })}
          ${field('Commission (ใส่ติดลบ)', 'commission', { value: t.commission ?? 0 })}
          ${field('Swap', 'swap', { value: t.swap ?? 0 })}
        </div>
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

  const preview = dlg.querySelector('#preview');
  const updatePreview = () => {
    const f = Object.fromEntries(new FormData(form));
    const n = (v) => (v === '' || v == null ? null : Number(v));
    const t = {
      symbol: f.symbol || 'EURUSD', direction: f.direction, entry_price: n(f.entry_price),
      sl: n(f.sl), tp: n(f.tp), exit_price: n(f.exit_price),
      profit: n(f.profit) ?? 0, commission: n(f.commission) ?? 0, swap: n(f.swap) ?? 0,
    };
    if (t.entry_price == null) return;
    const bits = [];
    const rr = plannedRR(t);
    bits.push(`RR ตามแผน ${rr == null ? '—' : '1 : ' + num(rr)}`);
    if (t.exit_price != null) {
      bits.push(`ผลจริง ${signed(pips(t), 1)} pips`);
      const r = realizedR(t);
      if (r != null) bits.push(`${signed(r)} R`);
      bits.push(`สุทธิ ${signed(netPnl(t))}`);
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
      entry_price: f.entry_price, sl: f.sl, tp: f.tp, exit_price: f.exit_price,
      open_time_utc: f.open_time ? localToUtc(f.open_time, tz) : '',
      close_time_utc: f.close_time ? localToUtc(f.close_time, tz) : '',
      profit: f.profit, commission: f.commission, swap: f.swap,
    };
    try {
      await api(trade ? `/api/trades/${trade.id}` : '/api/trades', { method: trade ? 'PUT' : 'POST', body });
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
