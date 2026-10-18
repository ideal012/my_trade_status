import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Reply } from './http.js';
import { listTrades } from './trades.js';
import { parseStrategy } from './strategies.js';
import { stamp } from './db.js';

// One CSV cell. Text starting with = + - @ would run as a formula in Excel, so it gets a leading '.
function cell(v) {
  if (v == null) return '';
  if (typeof v === 'number') return String(v);
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export const toCsv = (headers, rows) => [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');

const HEADERS = [
  'ticket', 'symbol', 'direction', 'lot', 'entry_price', 'sl', 'tp', 'exit_price', 'open_time_utc', 'close_time_utc',
  'profit', 'commission', 'swap', 'net', 'strategy', 'checklist_done', 'checklist_total', 'tags', 'emotion', 'notes', 'source', 'risk_amount',
];

export function exportRoutes(db, dataDir) {
  return [
    ['GET', '/api/export.csv', ({ query }) => {
      const strategies = new Map(db.prepare('SELECT * FROM strategies').all().map(parseStrategy).map((s) => [s.id, s]));
      const rows = listTrades(db, Number(query.get('account_id')) || null).map((t) => {
        const st = strategies.get(t.strategy_id);
        return [
          t.ticket, t.symbol, t.direction, t.lot, t.entry_price, t.sl, t.tp, t.exit_price, t.open_time_utc, t.close_time_utc,
          t.profit, t.commission, t.swap, t.profit == null ? null : Math.round((t.profit + t.commission + t.swap) * 1e8) / 1e8,
          st?.name, st ? t.checklist_done.length : null, st?.checklist.length ?? null, t.tags.join(';'), t.emotion, t.notes, t.source, t.risk_amount,
        ];
      });
      // BOM so Excel opens the file as UTF-8 (Thai text stays readable)
      return new Reply(`\ufeff${toCsv(HEADERS, rows)}`, 'text/csv; charset=utf-8', { 'Content-Disposition': 'attachment; filename="trades.csv"' });
    }],
    ['POST', '/api/backup', () => {
      mkdirSync(join(dataDir, 'backups'), { recursive: true });
      const file = join('backups', `journal-${stamp()}.db`);
      db.prepare('VACUUM INTO ?').run(join(dataDir, file));
      return { file };
    }],
  ];
}
