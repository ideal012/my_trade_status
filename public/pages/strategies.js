import { html, setHtml, state, api, loadBase, toast } from '../lib/ui.js';

function openForm(st, onSaved) {
  const dlg = document.createElement('dialog');
  dlg.innerHTML = html`
    <form method="dialog">
      <h2>${st ? 'แก้ไขกลยุทธ์' : 'เพิ่มกลยุทธ์'}</h2>
      <div class="form-error" hidden></div>
      <div class="fields">
        <label class="wide">ชื่อกลยุทธ์ <input name="name" value="${st?.name ?? ''}" required placeholder="เช่น London Breakout"></label>
        <label class="wide">คำอธิบาย <textarea name="description">${st?.description ?? ''}</textarea></label>
        <label class="wide">Checklist ก่อนเข้าเทรด (หนึ่งข้อต่อหนึ่งบรรทัด)
          <textarea name="checklist" rows="6" placeholder="เทรนด์ H4 ชัดเจน&#10;ราคาทดสอบแนวรับ/แนวต้าน&#10;RR อย่างน้อย 1:2&#10;ไม่มีข่าวแรงใน 30 นาที">${(st?.checklist ?? []).join('\n')}</textarea>
        </label>
      </div>
      <div class="dialog-actions"><span></span><span class="row">
        <button type="button" data-act="cancel">ยกเลิก</button><button type="submit" class="primary">บันทึก</button>
      </span></div>
    </form>`.s;
  document.body.append(dlg);
  const close = () => { dlg.close(); dlg.remove(); };
  dlg.querySelector('[data-act=cancel]').addEventListener('click', close);
  dlg.addEventListener('cancel', () => dlg.remove());
  dlg.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try {
      await api(st ? `/api/strategies/${st.id}` : '/api/strategies', {
        method: st ? 'PUT' : 'POST',
        body: { name: f.name, description: f.description, checklist: f.checklist.split('\n') },
      });
      close();
      toast('บันทึกแล้ว');
      onSaved();
    } catch (err) {
      const box = dlg.querySelector('.form-error');
      box.textContent = err.message;
      box.hidden = false;
    }
  });
  dlg.showModal();
}

export async function render(view) {
  const card = (st) => html`
    <div class="card">
      <div class="page-head">
        <div><h2>${st.name} ${st.archived ? html`<span class="badge muted">เก็บถาวร</span>` : ''}</h2>
          <p class="sub">${st.description || 'ไม่มีคำอธิบาย'}</p></div>
        <span class="row">
          <button data-edit="${st.id}">แก้ไข</button>
          <button data-archive="${st.id}">${st.archived ? 'กู้คืน' : 'เก็บถาวร'}</button>
        </span>
      </div>
      ${st.checklist.length ? html`<ol>${st.checklist.map((c) => html`<li>${c}</li>`)}</ol>` : html`<p class="sub">ยังไม่มี checklist</p>`}
    </div>`;

  setHtml(view, html`
    <div class="page-head">
      <div><h1>กลยุทธ์</h1><p class="sub">ตั้งเงื่อนไขก่อนเข้าเทรดเป็น checklist แล้วติ๊กในแต่ละไม้ เพื่อดูว่าทำตามกฎครบหรือไม่</p></div>
      <button class="primary" id="add">+ เพิ่มกลยุทธ์</button>
    </div>
    ${state.strategies.length ? state.strategies.map(card) : html`<div class="card empty">ยังไม่มีกลยุทธ์ — กด "+ เพิ่มกลยุทธ์" เพื่อสร้างอันแรก</div>`}`);

  const again = async () => { await loadBase(); render(view); };
  view.querySelector('#add').addEventListener('click', () => openForm(null, again));
  // each render replaces the markup, so listeners attached to inner nodes are dropped with it
  view.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
    openForm(state.strategies.find((s) => s.id === Number(b.dataset.edit)), again);
  }));
  view.querySelectorAll('[data-archive]').forEach((b) => b.addEventListener('click', async () => {
    const st = state.strategies.find((s) => s.id === Number(b.dataset.archive));
    await api(`/api/strategies/${st.id}`, { method: 'PUT', body: { archived: !st.archived } });
    again();
  }));
}
