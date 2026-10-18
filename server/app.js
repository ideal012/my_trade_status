import { readFile } from 'node:fs/promises';
import { resolve, sep, extname, join } from 'node:path';
import { HttpError, Reply, readJson } from './http.js';
import { buildRoutes } from './routes.js';

const ROOT = resolve(import.meta.dirname, '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};
const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};
const LOCAL_HOST = /^(localhost|127\.0\.0\.1)(:\d+)?$/;

const compile = ([method, path, handler]) => ({
  method,
  handler,
  re: new RegExp('^' + path.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'),
});

export function createApp({ db, dataDir, publicDir = join(ROOT, 'public') }) {
  const routes = buildRoutes(db, dataDir).map(compile);
  const publicRoot = resolve(publicDir);
  const chartFile = join(ROOT, 'node_modules', 'chart.js', 'dist', 'chart.umd.js');

  async function serveStatic(pathname) {
    if (pathname === '/vendor/chart.js') {
      return new Reply(await readFile(chartFile), TYPES['.js']);
    }
    let rel;
    try { rel = decodeURIComponent(pathname); } catch { throw new HttpError(404, 'ไม่พบหน้านี้'); }
    if (rel === '/') rel = '/index.html';
    if (rel.includes('\0') || rel.includes('\\')) throw new HttpError(404, 'ไม่พบหน้านี้');
    const file = resolve(publicRoot, '.' + rel);
    if (!file.startsWith(publicRoot + sep)) throw new HttpError(404, 'ไม่พบหน้านี้');
    const type = TYPES[extname(file)];
    if (!type) throw new HttpError(404, 'ไม่พบหน้านี้');
    try {
      return new Reply(await readFile(file), type);
    } catch {
      throw new HttpError(404, 'ไม่พบหน้านี้');
    }
  }

  async function dispatch(req) {
    if (!LOCAL_HOST.test(req.headers.host ?? '')) throw new HttpError(403, 'ไม่อนุญาต');
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) throw new HttpError(403, 'ไม่อนุญาต');

    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/') && !url.pathname.startsWith('/uploads/')) {
      if (req.method !== 'GET') throw new HttpError(405, 'ไม่รองรับ');
      return serveStatic(url.pathname);
    }
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = r.re.exec(url.pathname);
      if (!m) continue;
      const body = req.method === 'POST' || req.method === 'PUT' ? await readJson(req) : undefined;
      return r.handler({ params: { ...m.groups }, query: url.searchParams, body });
    }
    throw new HttpError(404, 'ไม่พบหน้านี้');
  }

  return async (req, res) => {
    let status = 200;
    let type = 'application/json; charset=utf-8';
    let headers = {};
    let out;
    try {
      const result = await dispatch(req);
      if (result instanceof Reply) {
        out = result.body;
        type = result.type;
        headers = result.headers;
      } else {
        out = JSON.stringify(result ?? {});
      }
    } catch (err) {
      status = err instanceof HttpError ? err.status : 500;
      if (!(err instanceof HttpError)) console.error(err);
      out = JSON.stringify({ error: err instanceof HttpError ? err.message : 'เกิดข้อผิดพลาดในระบบ' });
    }
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-cache', ...SECURITY_HEADERS, ...headers });
    res.end(out);
  };
}
