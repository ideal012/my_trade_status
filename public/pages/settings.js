import { html, setHtml, state, api, loadBase, toast, armDelete, raw } from '../lib/ui.js';

const zones = () => {
  const all = Intl.supportedValuesOf('timeZone');
  return all.includes('UTC') ? all : ['UTC', ...all];
};

export async function render(view) {
  const accountForm = (a) => html`
    <form class="card account-form" data-id="${a?.id ?? ''}">
      <div class="fields">
        <label>ชื่อบัญชี <input name="name" value="${a?.name ?? ''}" required placeholder="เช่น Exness Real"></label>
        <label>สกุลเงิน <input name="currency" value="${a?.currency ?? 'USD'}" required maxlength="8" placeholder="USD / USC"></label>
        <label>ทุนเริ่มต้น <input name="initial_capital" type="number" step="any" min="0" value="${a?.initial_capital ?? ''}" required></label>
      </div>
      <p class="form-error" hidden></p>
      <div class="row" style="margin-top:10px">
        <button class="primary" type="submit">${a ? 'บันทึก' : 'เพิ่มบัญชี'}</button>
        ${a ? html`<button type="button" class="danger" data-del>ลบบัญชี</button>` : ''}
      </div>
    </form>`;

  setHtml(view, html`
    <div class="page-head"><div><h1>ตั้งค่า</h1><p class="sub">บัญชี ทุน และโซนเวลา</p></div></div>

    <h2>โซนเวลา</h2>
    <div class="card">
      <label>เวลาที่แสดงในหน้าเว็บ (ข้อมูลที่เก็บไม่เปลี่ยน แสดงผลต่างกันเท่านั้น)
        <select id="tz">${zones().map((z) => html`<option ${raw(z === state.settings.timezone ? 'selected' : '')}>${z}</option>`)}</select>
      </label>
    </div>

    <h2 style="margin-top:24px">บัญชี</h2>
    ${state.accounts.map(accountForm)}
    <h2 style="margin-top:24px">เพิ่มบัญชีใหม่</h2>
    ${accountForm(null)}

    <h2 style="margin-top:24px">ข้อมูลและการสำรอง</h2>
    <div class="card">
      <p>ข้อมูลทั้งหมดอยู่ในโฟลเดอร์ <code>data</code> ของโปรแกรม (ไฟล์ <code>journal.db</code> และโฟลเดอร์ <code>uploads</code> ที่เก็บรูป) การสำรองที่ง่ายที่สุดคือคัดลอกโฟลเดอร์นี้เก็บไว้</p>
      <div class="row">
        <a class="btn" href="/api/export.csv?account_id=${state.accountId}" download="trades.csv">ดาวน์โหลดเทรดของบัญชีนี้เป็น CSV (เปิดด้วย Excel)</a>
        <button id="backup">สำรองฐานข้อมูลตอนนี้</button>
        <span id="backup-msg" class="sub"></span>
      </div>
    </div>`);

  const again = async () => { await loadBase(); render(view); };

  view.querySelector('#backup').addEventListener('click', async () => {
    const msg = view.querySelector('#backup-msg');
    try {
      const r = await api('/api/backup', { method: 'POST' });
      msg.textContent = `สำรองแล้ว: data/${r.file.replaceAll('\\', '/')} (ไม่รวมรูป screenshot ให้คัดลอกโฟลเดอร์ data/uploads ด้วย)`;
    } catch (err) { msg.textContent = err.message; }
  });

  view.querySelector('#tz').addEventListener('change', async (e) => {
    await api('/api/settings', { method: 'PUT', body: { timezone: e.target.value } });
    await loadBase();
    toast(`ใช้โซนเวลา ${e.target.value}`);
  });

  view.querySelectorAll('.account-form').forEach((form) => {
    const id = form.dataset.id;
    const showError = (msg) => { const box = form.querySelector('.form-error'); box.textContent = msg; box.hidden = false; };
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api(id ? `/api/accounts/${id}` : '/api/accounts', { method: id ? 'PUT' : 'POST', body: Object.fromEntries(new FormData(form)) });
        toast('บันทึกแล้ว');
        again();
      } catch (err) { showError(err.message); }
    });
    const del = form.querySelector('[data-del]');
    if (del) armDelete(del, async () => {
      try {
        await api(`/api/accounts/${id}`, { method: 'DELETE' });
        again();
      } catch (err) { showError(err.message); }
    });
  });
}
