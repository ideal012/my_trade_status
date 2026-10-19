import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { startTestServer, sampleTrade } from './helpers.js';

let s;
before(async () => { s = await startTestServer(); });
after(() => s.close());

const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from('fake-image-body')]);
const upload = (tradeId, over = {}) =>
  s.call('POST', `/api/trades/${tradeId}/screenshots`, { mime: 'image/png', data: PNG.toString('base64'), caption: 'entry', ...over });
const newTrade = async () => (await s.call('POST', '/api/trades', sampleTrade())).json.id;
const uploadsDir = () => join(s.dataDir, 'uploads');

test('upload, list and serve a screenshot', async () => {
  const id = await newTrade();
  const r = await upload(id);
  assert.equal(r.status, 200);
  assert.match(r.json.filename, /^[0-9a-f-]{36}\.png$/);
  assert.equal(r.json.caption, 'entry');

  const trade = (await s.call('GET', '/api/trades?account_id=1')).json.find((t) => t.id === id);
  assert.equal(trade.screenshots.length, 1);

  const res = await fetch(`http://127.0.0.1:${s.port}/uploads/${r.json.filename}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), PNG);
});

test('rejects wrong type, fake content, oversize and unknown trade', async () => {
  const id = await newTrade();
  assert.equal((await upload(id, { mime: 'text/html' })).status, 400);
  assert.equal((await upload(id, { mime: 'image/svg+xml' })).status, 400);
  assert.equal((await upload(id, { data: Buffer.from('<script>alert(1)</script>').toString('base64') })).status, 400);
  const big = Buffer.concat([PNG, Buffer.alloc(10 * 1024 * 1024)]);
  assert.equal((await upload(id, { data: big.toString('base64') })).status, 400);
  assert.equal((await upload(99999)).status, 404);
});

test('upload names are not user controlled and bad names are 404', async () => {
  for (const name of ['..%2fpackage.json', 'x.png', 'a.html']) {
    const res = await fetch(`http://127.0.0.1:${s.port}/uploads/${name}`);
    assert.equal(res.status, 404, name);
  }
});

test('deleting a screenshot removes its file', async () => {
  const id = await newTrade();
  const r = await upload(id);
  assert.ok(existsSync(join(uploadsDir(), r.json.filename)));
  assert.equal((await s.call('DELETE', `/api/screenshots/${r.json.id}`)).status, 200);
  assert.ok(!existsSync(join(uploadsDir(), r.json.filename)));
  assert.equal((await s.call('DELETE', `/api/screenshots/${r.json.id}`)).status, 404);
});

test('deleting a trade removes its screenshot files', async () => {
  const id = await newTrade();
  const a = await upload(id);
  const b = await upload(id);
  await s.call('DELETE', `/api/trades/${id}`);
  assert.ok(!existsSync(join(uploadsDir(), a.json.filename)));
  assert.ok(!existsSync(join(uploadsDir(), b.json.filename)));
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM screenshots WHERE trade_id = ?').get(id).n, 0);
  assert.ok(Array.isArray(readdirSync(uploadsDir())));
});

test('a trade holds at most 30 screenshots', async () => {
  const id = await newTrade();
  for (let i = 0; i < 30; i++) assert.equal((await upload(id)).status, 200);
  const over = await upload(id);
  assert.equal(over.status, 400);
  assert.match(over.json.error, /30/);
});
