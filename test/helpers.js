import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';

export async function startTestServer() {
  const db = openDb(':memory:');
  const dataDir = mkdtempSync(join(tmpdir(), 'journal-'));
  const server = createServer(createApp({ db, dataDir }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  async function call(method, path, body) {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json, text, headers: res.headers };
  }

  return {
    call, db, dataDir, port,
    async close() {
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

export const sampleTrade = (over = {}) => ({
  account_id: 1, symbol: 'eurusd', direction: 'buy', lot: 0.1,
  entry_price: 1.1, sl: 1.095, tp: 1.11, exit_price: 1.108,
  open_time_utc: '2024-03-04T08:00:00.000Z', close_time_utc: '2024-03-04T12:00:00.000Z',
  profit: 80, commission: -0.7, swap: 0, ...over,
});
