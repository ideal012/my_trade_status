import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, sampleTrade } from './helpers.js';

let s;
before(async () => { s = await startTestServer(); });
after(() => s.close());

test('create and update an account', async () => {
  const c = await s.call('POST', '/api/accounts', { name: ' Cent ', currency: 'usc', initial_capital: '500' });
  assert.equal(c.status, 200);
  assert.equal(c.json.name, 'Cent');
  assert.equal(c.json.currency, 'USC');
  assert.equal(c.json.initial_capital, 500);
  const u = await s.call('PUT', `/api/accounts/${c.json.id}`, { initial_capital: 750 });
  assert.equal(u.json.initial_capital, 750);
  assert.equal(u.json.name, 'Cent');
});

test('account validation', async () => {
  for (const b of [{ name: '' }, { name: 'x', initial_capital: -5 }, { name: 'x', initial_capital: 'abc' }, { name: 'x', currency: 'TOOLONGCURRENCY' }]) {
    assert.equal((await s.call('POST', '/api/accounts', b)).status, 400, JSON.stringify(b));
  }
  assert.equal((await s.call('PUT', '/api/accounts/9999', { name: 'x' })).status, 404);
});

test('account with trades cannot be deleted; empty one can; last one cannot', async () => {
  const a = await s.call('POST', '/api/accounts', { name: 'Has trades' });
  await s.call('POST', '/api/trades', sampleTrade({ account_id: a.json.id }));
  const blocked = await s.call('DELETE', `/api/accounts/${a.json.id}`);
  assert.equal(blocked.status, 400);
  assert.match(blocked.json.error, /[\u0E00-\u0E7F]/);

  const empty = await s.call('POST', '/api/accounts', { name: 'Empty' });
  assert.equal((await s.call('DELETE', `/api/accounts/${empty.json.id}`)).status, 200);

  const all = (await s.call('GET', '/api/accounts')).json;
  for (const acc of all.slice(1)) s.db.prepare('DELETE FROM trades WHERE account_id = ?').run(acc.id);
  for (const acc of all.slice(1)) await s.call('DELETE', `/api/accounts/${acc.id}`);
  assert.equal((await s.call('DELETE', `/api/accounts/${all[0].id}`)).status, 400);
});

test('timezone setting is validated and saved', async () => {
  assert.equal((await s.call('PUT', '/api/settings', { timezone: 'Mars/Olympus' })).status, 400);
  const ok = await s.call('PUT', '/api/settings', { timezone: 'Europe/London' });
  assert.equal(ok.json.timezone, 'Europe/London');
  assert.equal((await s.call('GET', '/api/settings')).json.timezone, 'Europe/London');
});

test('max risk % rule is validated and saved, default 2', async () => {
  assert.equal((await s.call('GET', '/api/settings')).json.max_risk_pct, '2');
  for (const bad of [0, -1, 101, 'abc']) {
    assert.equal((await s.call('PUT', '/api/settings', { max_risk_pct: bad })).status, 400, String(bad));
  }
  assert.equal((await s.call('PUT', '/api/settings', { max_risk_pct: 1.5 })).json.max_risk_pct, '1.5');
});

test('account kind defaults to live and only takes the four kinds (task 19)', async () => {
  const live = await s.call('POST', '/api/accounts', { name: 'Real', initial_capital: 100 });
  assert.equal(live.json.kind, 'live');
  const bt = await s.call('POST', '/api/accounts', { name: 'BT', initial_capital: 10000, kind: 'backtest' });
  assert.equal(bt.json.kind, 'backtest');
  assert.equal((await s.call('PUT', `/api/accounts/${bt.json.id}`, { initial_capital: 5 })).json.kind, 'backtest');
  assert.equal((await s.call('PUT', `/api/accounts/${bt.json.id}`, { kind: 'replay' })).json.kind, 'replay');
  assert.equal((await s.call('POST', '/api/accounts', { name: 'x', kind: 'paper' })).status, 400);
});
