import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers.js';

let s;
before(async () => { s = await startTestServer(); });
after(() => s.close());

test('cash flows: add, list per account, validate, delete (task 24)', async () => {
  const add = await s.call('POST', '/api/cashflows', { account_id: 1, time_utc: '2024-03-02T00:00:00.000Z', amount: '1000', note: 'เติมเงิน' });
  assert.equal(add.status, 200);
  assert.equal(add.json.amount, 1000);
  await s.call('POST', '/api/cashflows', { account_id: 1, time_utc: '2024-03-05T00:00:00.000Z', amount: -200 });
  const list = await s.call('GET', '/api/cashflows?account_id=1');
  assert.deepEqual(list.json.map((f) => f.amount), [1000, -200]);
  for (const bad of [{ account_id: 1, time_utc: 'x', amount: 5 }, { account_id: 1, time_utc: '2024-01-01', amount: 0 },
    { account_id: 1, time_utc: '2024-01-01', amount: 'abc' }, { account_id: 999, time_utc: '2024-01-01', amount: 5 }]) {
    assert.equal((await s.call('POST', '/api/cashflows', bad)).status, 400, JSON.stringify(bad));
  }
  assert.equal((await s.call('DELETE', `/api/cashflows/${add.json.id}`)).status, 200);
  assert.equal((await s.call('GET', '/api/cashflows?account_id=1')).json.length, 1);
  assert.equal((await s.call('DELETE', '/api/cashflows/9999')).status, 404);
});
