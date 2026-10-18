import { state, hooks, loadBase, destroyCharts, html, setHtml, esc } from './lib/ui.js';

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

// Light / dark theme (the first choice is made in theme.js before the page paints).
const themeBtn = document.getElementById('theme-toggle');
function showThemeButton() {
  const dark = document.documentElement.dataset.theme === 'dark';
  themeBtn.querySelector('use').setAttribute('href', dark ? '#i-sun' : '#i-moon');
  themeBtn.querySelector('span').textContent = dark ? 'โหมดสว่าง' : 'โหมดมืด';
  themeBtn.setAttribute('aria-label', dark ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด');
}
themeBtn.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch { /* not saved, still switches */ }
  showThemeButton();
  route(); // redraw charts with the new colours
});
showThemeButton();

// Pages call loadBase() after changing accounts / strategies / settings; the picker follows.
hooks.afterBase = fillAccountPicker;

window.addEventListener('hashchange', route);
await loadBase();
route();
