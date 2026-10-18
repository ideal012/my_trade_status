import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, sampleTrade } from './helpers.js';

let s;
before(async () => { s = await startTestServer(); });
after(() => s.close());

test('create then list a trade', async () => {
  const created = await s.call('POST', '/api/trades', sampleTrade({ tags: 'london, breakout,london' }));
  assert.equal(created.status, 200);
  assert.equal(created.json.symbol, 'EURUSD');
  assert.deepEqual(created.json.tags, ['london', 'breakout']);

  const list = await s.call('GET', '/api/trades?account_id=1');
  assert.equal(list.status, 200);
  assert.equal(list.json.length, 1);
  assert.equal(list.json[0].id, created.json.id);
  assert.equal(list.json[0].open_time_utc, '2024-03-04T08:00:00.000Z');
  assert.equal(list.json[0].profit, 80);
});

test('list is newest first and filtered by account', async () => {
  await s.call('POST', '/api/trades', sampleTrade({ open_time_utc: '2024-03-05T08:00:00Z', close_time_utc: '2024-03-05T09:00:00Z' }));
  const list = await s.call('GET', '/api/trades?account_id=1');
  assert.ok(list.json[0].open_time_utc > list.json[1].open_time_utc);
  const other = await s.call('GET', '/api/trades?account_id=999');
  assert.deepEqual(other.json, []);
});

test('invalid input is rejected with a Thai message', async () => {
  const bad = [
    sampleTrade({ symbol: '' }),
    sampleTrade({ direction: 'hold' }),
    sampleTrade({ lot: 0 }),
    sampleTrade({ entry_price: 'abc' }),
    sampleTrade({ profit: '' }),
    sampleTrade({ sl: 'x' }),
    sampleTrade({ open_time_utc: 'not a date' }),
    sampleTrade({ close_time_utc: '2024-03-04T07:00:00.000Z' }), // before open
    sampleTrade({ account_id: 999 }),
    sampleTrade({ strategy_id: 999 }),
    sampleTrade({ checklist_done: ['a'] }),
  ];
  for (const b of bad) {
    const r = await s.call('POST', '/api/trades', b);
    assert.equal(r.status, 400, JSON.stringify(b));
    assert.match(r.json.error, /[฀-๿]/);
  }
});

test('optional SL/TP may be empty and are stored as null', async () => {
  const r = await s.call('POST', '/api/trades', sampleTrade({ sl: '', tp: null }));
  assert.equal(r.status, 200);
  assert.equal(r.json.sl, null);
  assert.equal(r.json.tp, null);
});

test('duplicate ticket in the same account is refused', async () => {
  assert.equal((await s.call('POST', '/api/trades', sampleTrade({ ticket: '555' }))).status, 200);
  const dup = await s.call('POST', '/api/trades', sampleTrade({ ticket: '555' }));
  assert.equal(dup.status, 400);
  assert.match(dup.json.error, /555|Ticket/i);
});

test('malformed JSON body gives 400', async () => {
  const res = await fetch(`http://127.0.0.1:${s.port}/api/trades`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oops' });
  assert.equal(res.status, 400);
});

test('update changes only what is sent and keeps the rest', async () => {
  const c = await s.call('POST', '/api/trades', sampleTrade({ tags: 'a', notes: 'keep me', ticket: '900' }));
  const r = await s.call('PUT', `/api/trades/${c.json.id}`, { ...sampleTrade({ profit: -50, exit_price: 1.095 }) });
  assert.equal(r.status, 200);
  assert.equal(r.json.profit, -50);
  assert.equal(r.json.notes, 'keep me');
  assert.deepEqual(r.json.tags, ['a']);
  assert.equal(r.json.ticket, '900');
});

test('update validates and 404s on unknown id', async () => {
  const c = await s.call('POST', '/api/trades', sampleTrade());
  assert.equal((await s.call('PUT', `/api/trades/${c.json.id}`, { lot: -1 })).status, 400);
  assert.equal((await s.call('PUT', '/api/trades/99999', sampleTrade())).status, 404);
});

test('update cannot steal another trade ticket', async () => {
  await s.call('POST', '/api/trades', sampleTrade({ ticket: 'T1' }));
  const b = await s.call('POST', '/api/trades', sampleTrade({ ticket: 'T2' }));
  assert.equal((await s.call('PUT', `/api/trades/${b.json.id}`, { ticket: 'T1' })).status, 400);
});

test('delete removes the trade', async () => {
  const c = await s.call('POST', '/api/trades', sampleTrade());
  assert.equal((await s.call('DELETE', `/api/trades/${c.json.id}`)).status, 200);
  const list = await s.call('GET', '/api/trades?account_id=1');
  assert.ok(!list.json.some((t) => t.id === c.json.id));
  assert.equal((await s.call('DELETE', `/api/trades/${c.json.id}`)).status, 404);
});
