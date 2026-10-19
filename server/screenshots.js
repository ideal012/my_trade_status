import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { HttpError, Reply } from './http.js';

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PER_TRADE = 30;
const startsWith = (buf, hex) => buf.subarray(0, hex.length / 2).equals(Buffer.from(hex, 'hex'));

// Only these types are accepted, and the file content must match the claimed type
// (no SVG/HTML: a served upload could otherwise run script on the app's origin).
const KINDS = {
  'image/png': { ext: 'png', ok: (b) => startsWith(b, '89504e470d0a1a0a') },
  'image/jpeg': { ext: 'jpg', ok: (b) => startsWith(b, 'ffd8ff') },
  'image/webp': { ext: 'webp', ok: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
};
const MIME_BY_EXT = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
const NAME = /^[0-9a-f-]{36}\.(png|jpg|webp)$/;

export function removeUploads(dataDir, filenames) {
  for (const f of filenames) if (NAME.test(f)) rmSync(join(dataDir, 'uploads', f), { force: true });
}

export function screenshotRoutes(db, dataDir) {
  const dir = join(dataDir, 'uploads');
  return [
    ['POST', '/api/trades/:id/screenshots', ({ params, body }) => {
      const tradeId = Number(params.id);
      if (!db.prepare('SELECT 1 FROM trades WHERE id = ?').get(tradeId)) throw new HttpError(404, 'ไม่พบเทรดนี้');
      if (db.prepare('SELECT COUNT(*) AS n FROM screenshots WHERE trade_id = ?').get(tradeId).n >= MAX_PER_TRADE) throw new HttpError(400, `แนบรูปได้ไม่เกิน ${MAX_PER_TRADE} รูปต่อไม้`);
      const kind = KINDS[body?.mime];
      if (!kind) throw new HttpError(400, 'รองรับเฉพาะรูป PNG, JPG, WebP');
      const bytes = Buffer.from(String(body.data ?? ''), 'base64');
      if (bytes.length > MAX_BYTES) throw new HttpError(400, 'รูปใหญ่เกิน 10 MB');
      if (!kind.ok(bytes)) throw new HttpError(400, 'ไฟล์ไม่ใช่รูปภาพที่ถูกต้อง');
      const filename = `${randomUUID()}.${kind.ext}`;
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, filename), bytes);
      const caption = String(body.caption ?? '').slice(0, 200);
      const id = db.prepare('INSERT INTO screenshots (trade_id, filename, caption) VALUES (?, ?, ?)').run(tradeId, filename, caption).lastInsertRowid;
      return db.prepare('SELECT * FROM screenshots WHERE id = ?').get(id);
    }],
    ['DELETE', '/api/screenshots/:id', ({ params }) => {
      const row = db.prepare('SELECT * FROM screenshots WHERE id = ?').get(Number(params.id));
      if (!row) throw new HttpError(404, 'ไม่พบรูปนี้');
      db.prepare('DELETE FROM screenshots WHERE id = ?').run(row.id);
      removeUploads(dataDir, [row.filename]);
      return {};
    }],
    ['GET', '/uploads/:name', ({ params }) => {
      if (!NAME.test(params.name)) throw new HttpError(404, 'ไม่พบไฟล์');
      try {
        return new Reply(readFileSync(join(dir, params.name)), MIME_BY_EXT[params.name.split('.')[1]], { 'Cache-Control': 'private, max-age=31536000, immutable' });
      } catch {
        throw new HttpError(404, 'ไม่พบไฟล์');
      }
    }],
  ];
}
