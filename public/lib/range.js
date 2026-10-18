// Period filter shared by the dashboard and analytics pages. The choice is remembered in this browser.
import { rangeBounds } from './calc.js';

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
