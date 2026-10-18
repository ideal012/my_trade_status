import { state, loadBase, destroyCharts, html, setHtml, esc } from './lib/ui.js';

const PAGES = ['dashboard', 'trades', 'analytics', 'strategies', 'import', 'settings'];
const view = document.getElementById('view');

function parseHash() {
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  return { page: PAGES.includes(path) ? path : 'dashboard', query: new URLSearchParams(query) };
}

export async function route() {
  const { page, query } = parseHash();
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.page === page));
  destroyCharts();
  try {
    const mod = await import(`./pages/${page}.js`);
    await mod.render(view, { query });
  } catch (err) {
    console.error(err);
    const missing = err instanceof TypeError || /Failed to fetch dynamically/.test(err.message);
    setHtml(view, html`<div class="card empty">${missing ? 'หน้านี้ยังไม่พร้อมใช้งาน' : `เกิดข้อผิดพลาด: ${err.message}`}</div>`);
  }
}

function fillAccountPicker() {
  const sel = document.getElementById('account-select');
  sel.innerHTML = state.accounts
    .map((a) => `<option value="${a.id}"${a.id === state.accountId ? ' selected' : ''}>${esc(a.name)}</option>`)
    .join('');
}

document.getElementById('account-select').addEventListener('change', (e) => {
  state.accountId = Number(e.target.value);
  localStorage.setItem('accountId', state.accountId);
  route();
});

// Pages call this after changing accounts / strategies / settings.
window.addEventListener('base-changed', async () => { await loadBase(); fillAccountPicker(); });

window.addEventListener('hashchange', route);
await loadBase();
fillAccountPicker();
route();
