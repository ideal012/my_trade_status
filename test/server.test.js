import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { startTestServer } from './helpers.js';

let s;
before(async () => { s = await startTestServer(); });
after(() => s.close());

const raw = (path, headers = {}) => new Promise((resolve, reject) => {
  const req = request({ host: '127.0.0.1', port: s.port, path, headers }, (res) => {
    res.resume();
    res.on('end', () => resolve(res.statusCode));
  });
  req.on('error', reject);
  req.end();
});

test('health endpoint answers ok', async () => {
  const r = await s.call('GET', '/api/health');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ok: true });
});

test('index page is served with security headers', async () => {
  const r = await s.call('GET', '/');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/html/);
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
});

test('path traversal is refused', async () => {
  for (const p of ['/%2e%2e%2fpackage.json', '/..%5cpackage.json', '/%2e%2e/server/db.js', '/%00']) {
    assert.equal(await raw(p), 404, p);
  }
});

test('foreign Host header is refused (DNS rebinding)', async () => {
  assert.equal(await raw('/api/health', { Host: 'evil.example.com' }), 403);
});

test('default account and timezone are created', async () => {
  const row = s.db.prepare('SELECT COUNT(*) AS n FROM accounts').get();
  assert.equal(row.n, 1);
  const tz = s.db.prepare("SELECT value FROM settings WHERE key = 'timezone'").get();
  assert.equal(tz.value, 'Asia/Bangkok');
});
