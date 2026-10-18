import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { openDb } from './db.js';
import { createApp } from './app.js';

const port = Number(process.env.PORT) || 3000;
const dataDir = process.env.DATA_DIR || join(import.meta.dirname, '..', 'data');
const db = openDb(join(dataDir, 'journal.db'));

const server = createServer(createApp({ db, dataDir }));
server.on('error', (err) => {
  console.error(err.code === 'EADDRINUSE'
    ? `พอร์ต ${port} ถูกใช้งานอยู่ (อาจเปิดโปรแกรมนี้ไว้แล้ว) หรือตั้งพอร์ตใหม่ด้วย PORT=3001`
    : err);
  process.exit(1);
});
// Only listen on this computer: other devices on the network cannot reach the journal.
server.listen(port, '127.0.0.1', () => {
  const url = `http://localhost:${port}`;
  console.log(`เปิดสมุดเทรดที่ ${url}  (กด Ctrl+C เพื่อหยุด)`);
  if (process.env.NO_OPEN) return;
  // open the default browser; failure is harmless, the URL is printed above
  const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
});
