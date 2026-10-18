// Period filter shared by the dashboard and analytics pages. The choice is remembered in this browser.
import { rangeBounds } from './calc.js';
import { html } from './ui.js';

export const RANGES = [['week', 'สัปดาห์นี้'], ['month', 'เดือนนี้'], ['all', 'ทั้งหมด'], ['custom', 'กำหนดเอง']];

let current = null;

export function readRange() {
  if (!current) {
    try { current = JSON.parse(localStorage.getItem('range')); } catch { /* storage unavailable */ }
    current ??= { kind: 'all', from: null, to: null };
  }
  return current;
}

export function writeRange(r) {
  current = r;
  try { localStorage.setItem('range', JSON.stringify(r)); } catch { /* ignore */ }
}

// -> { bounds: { from, to } | null, label }
export function rangeFilter(sel, timeZone) {
  if (sel.kind === 'custom') {
    const text = sel.from || sel.to ? `${sel.from ?? 'เริ่มต้น'} ถึง ${sel.to ?? 'ปัจจุบัน'}` : 'ทั้งหมด (เลือกวันที่)';
    return { bounds: sel.from || sel.to ? { from: sel.from, to: sel.to } : null, label: text };
  }
  return { bounds: rangeBounds(sel.kind, timeZone), label: RANGES.find(([k]) => k === sel.kind)?.[1] ?? 'ทั้งหมด' };
}

export function rangeBar(sel) {
  return html`<div class="row" id="range">
    ${RANGES.map(([k, text]) => html`<button class="seg ${sel.kind === k ? 'active' : ''}" data-kind="${k}">${text}</button>`)}
    ${sel.kind === 'custom' ? html`
      <input type="date" id="from" value="${sel.from ?? ''}" style="width:auto">
      <span>ถึง</span>
      <input type="date" id="to" value="${sel.to ?? ''}" style="width:auto">` : ''}
  </div>`;
}

export function bindRangeBar(view, sel, onChange) {
  view.querySelector('#range').addEventListener('click', (e) => {
    const b = e.target.closest('[data-kind]');
    if (!b) return;
    writeRange({ ...sel, kind: b.dataset.kind });
    onChange();
  });
  for (const id of ['from', 'to']) {
    view.querySelector(`#${id}`)?.addEventListener('change', (e) => { writeRange({ ...sel, [id]: e.target.value || null }); onChange(); });
  }
}
