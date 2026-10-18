import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, sampleTrade } from './helpers.js';

let s;
before(async () => { s = await startTestServer(); });
after(() => s.close());

test('create strategy with a cleaned checklist', async () => {
  const r = await s.call('POST', '/api/strategies', {
    name: ' Breakout ', description: 'London breakout', checklist: [' เทรนด์ H4 ชัด ', '', 'RR >= 2', 'ข่าวแดงไม่ใกล้'],
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.name, 'Breakout');
  assert.deepEqual(r.json.checklist, ['เทรนด์ H4 ชัด', 'RR >= 2', 'ข่าวแดงไม่ใกล้']);
  assert.equal(r.json.archived, false);
});

test('name is required', async () => {
  assert.equal((await s.call('POST', '/api/strategies', { name: '  ' })).status, 400);
  assert.equal((await s.call('POST', '/api/strategies', { name: 'x', checklist: 'nope' })).status, 400);
});

test('update and archive', async () => {
  const c = await s.call('POST', '/api/strategies', { name: 'Pullback', checklist: ['a'] });
  const r = await s.call('PUT', `/api/strategies/${c.json.id}`, { name: 'Pullback v2', checklist: ['a', 'b'], archived: true });
  assert.equal(r.json.name, 'Pullback v2');
  assert.deepEqual(r.json.checklist, ['a', 'b']);
  assert.equal(r.json.archived, true);
  const list = await s.call('GET', '/api/strategies');
  assert.ok(list.json.find((x) => x.id === c.json.id).archived);
  assert.equal((await s.call('PUT', '/api/strategies/9999', { name: 'x' })).status, 404);
});

test('trade stores strategy, checklist ticks, tags, emotion and notes', async () => {
  const st = await s.call('POST', '/api/strategies', { name: 'S', checklist: ['a', 'b', 'c'] });
  const t = await s.call('POST', '/api/trades', sampleTrade({
    strategy_id: st.json.id, checklist_done: [0, 2], tags: ['news', 'A+'], emotion: 'มั่นใจ', notes: 'เข้าตามแผน',
  }));
  assert.equal(t.status, 200);
  assert.deepEqual(t.json.checklist_done, [0, 2]);
  assert.deepEqual(t.json.tags, ['news', 'A+']);
  assert.equal(t.json.emotion, 'มั่นใจ');
  assert.equal(t.json.strategy_id, st.json.id);
  // archiving keeps old trades readable
  await s.call('PUT', `/api/strategies/${st.json.id}`, { archived: true });
  const list = await s.call('GET', '/api/trades?account_id=1');
  assert.equal(list.json.find((x) => x.id === t.json.id).strategy_id, st.json.id);
});
