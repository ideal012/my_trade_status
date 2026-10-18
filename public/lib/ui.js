// Shared helpers for all pages: safe HTML templating, API calls, number formatting, charts.

class Raw {
  constructor(s) { this.s = s; }
}
export const raw = (s) => new Raw(s);

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

// html`<p>${userText}</p>`: every value is escaped unless wrapped in raw() or is an array of such.
export function html(strings, ...values) {
  const part = (v) => (v instanceof Raw ? v.s : Array.isArray(v) ? v.map(part).join('') : esc(v));
  return new Raw(strings.reduce((out, s, i) => out + s + (i < values.length ? part(values[i]) : ''), ''));
}
export const setHtml = (el, tpl) => { el.innerHTML = tpl.s; };

export const state = { accounts: [], accountId: null, settings: { timezone: 'Asia/Bangkok' }, strategies: [] };
export const account = () => state.accounts.find((a) => a.id === state.accountId);

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด');
  return data;
}

export const hooks = { afterBase() {} };

export async function loadBase() {
  const [accounts, settings, strategies] = await Promise.all([
    api('/api/accounts'), api('/api/settings'), api('/api/strategies'),
  ]);
  state.accounts = accounts;
  state.settings = settings;
  state.strategies = strategies;
  if (!accounts.some((a) => a.id === state.accountId)) {
    state.accountId = Number(localStorage.getItem('accountId')) || accounts[0]?.id;
    if (!accounts.some((a) => a.id === state.accountId)) state.accountId = accounts[0]?.id;
  }
  hooks.afterBase();
}

export const loadTrades = () => api(`/api/trades?account_id=${state.accountId}`);

// ---- formatting ----
export const num = (n, d = 2) =>
  n == null || !Number.isFinite(n) ? '—' : n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
export const signed = (n, d = 2) => (n == null || !Number.isFinite(n) ? '—' : (n > 0 ? '+' : n < 0 ? '−' : '') + num(Math.abs(n), d));
export const tone = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
export const pct = (n, d = 1) => (n == null || !Number.isFinite(n) ? '—' : `${num(n, d)}%`);
export const price = (n) => (n == null ? '—' : String(n));

export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2500);
}

// Two-click delete: first click arms the button, second confirms. No native dialogs.
export function armDelete(btn, onConfirm) {
  let armed = false;
  btn.addEventListener('click', () => {
    if (armed) return onConfirm();
    armed = true;
    btn.textContent = 'กดอีกครั้งเพื่อยืนยันลบ';
    btn.classList.add('confirm');
    setTimeout(() => { armed = false; btn.textContent = btn.dataset.label; btn.classList.remove('confirm'); }, 4000);
  });
  btn.dataset.label = btn.textContent;
}

// ---- charts ----
let charts = [];
export function destroyCharts() {
  charts.forEach((c) => c.destroy());
  charts = [];
}
export function makeChart(canvas, config) {
  config.options = { responsive: true, maintainAspectRatio: false, ...config.options };
  const c = new Chart(canvas, config);
  charts.push(c);
  return c;
}
export const COLORS = { pos: '#15803d', neg: '#c62828', accent: '#2563eb', muted: '#98a2b3' };
