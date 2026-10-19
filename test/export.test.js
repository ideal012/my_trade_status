import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startTestServer, sampleTrade } from './helpers.js';
import { toCsv } from '../server/export.js';

let s;
before(async () => { s = await startTestServer(); });
after(() => s.close());

test('csv escaping: commas, quotes, newlines and spreadsheet formulas', () => {
  const csv = toCsv(['a', 'b'], [['plain', 5], ['x, y', 'say "hi"'], ['line1\nline2', '=SUM(A1)'], ['+1', '-2'], [null, 0.5]]);
  assert.equal(csv, 'a,b\r\nplain,5\r\n"x, y","say ""hi"""\r\n"line1\nline2",\'=SUM(A1)\r\n\'+1,\'-2\r\n,0.5');
});

test('export is a UTF-8 CSV (with BOM for Excel) containing the trades', async () => {
  const strat = await s.call('POST', '/api/strategies', { name: 'London, Breakout', checklist: ['a', 'b'] });
  await s.call('POST', '/api/trades', sampleTrade({ ticket: '77', strategy_id: strat.json.id, checklist_done: [0], tags: ['x', 'y'], emotion: 'มั่นใจ', notes: 'โน้ต, "quoted"\nบรรทัดสอง' }));
  const res = await fetch(`http://127.0.0.1:${s.port}/api/export.csv?account_id=1`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/csv/);
  assert.match(res.headers.get('content-disposition'), /attachment/);
  const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(await res.arrayBuffer());
  assert.equal(text.charCodeAt(0), 0xfeff);
  const [head, ...rest] = text.slice(1).split('\r\n');
  assert.match(head, /^ticket,symbol,direction,lot,/);
  assert.ok(text.includes('"London, Breakout"'));
  assert.ok(text.includes('"โน้ต, ""quoted""\nบรรทัดสอง"'));
  assert.ok(text.includes('x y') || text.includes('x;y'));
  assert.ok(rest.length >= 1);
});

test('backup writes a database copy that holds the data', async () => {
  const r = await s.call('POST', '/api/backup');
  assert.equal(r.status, 200);
  assert.match(r.json.file, /^backups.journal-\d{8}-\d{6}\.db$/);
  const file = join(s.dataDir, r.json.file);
  assert.ok(existsSync(file));
  const copy = new DatabaseSync(file, { readOnly: true });
  assert.ok(copy.prepare('SELECT COUNT(*) AS n FROM trades').get().n >= 1);
  copy.close();
});

test('two backups in the same second do not collide', async () => {
  const [a, b] = [await s.call('POST', '/api/backup'), await s.call('POST', '/api/backup')];
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.notEqual(a.json.file, b.json.file);
});
