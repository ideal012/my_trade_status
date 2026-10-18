import { HttpError } from './http.js';

export const parseStrategy = (r) => ({ ...r, checklist: JSON.parse(r.checklist), archived: !!r.archived });

function getStrategy(db, id) {
  const row = db.prepare('SELECT * FROM strategies WHERE id = ?').get(id);
  if (!row) throw new HttpError(404, 'ไม่พบกลยุทธ์นี้');
  return parseStrategy(row);
}

// Partial update: body fields override the stored strategy.
function cleanStrategy(body, base = {}) {
  const b = { ...base, ...body };
  const name = String(b.name ?? '').trim().slice(0, 80);
  if (!name) throw new HttpError(400, 'กรอกชื่อกลยุทธ์');
  if (!Array.isArray(b.checklist ?? [])) throw new HttpError(400, 'checklist ต้องเป็นรายการ');
  const checklist = (b.checklist ?? []).map((x) => String(x).trim().slice(0, 200)).filter(Boolean).slice(0, 50);
  return { name, description: String(b.description ?? '').slice(0, 2000), checklist: JSON.stringify(checklist), archived: b.archived ? 1 : 0 };
}

export function strategyRoutes(db) {
  return [
    ['GET', '/api/strategies', () => db.prepare('SELECT * FROM strategies ORDER BY archived, name').all().map(parseStrategy)],
    ['POST', '/api/strategies', ({ body }) => {
      const s = cleanStrategy(body ?? {});
      const id = db.prepare('INSERT INTO strategies (name, description, checklist, archived) VALUES (:name, :description, :checklist, :archived)').run(s).lastInsertRowid;
      return getStrategy(db, Number(id));
    }],
    ['PUT', '/api/strategies/:id', ({ params, body }) => {
      const id = Number(params.id);
      const s = cleanStrategy(body ?? {}, getStrategy(db, id));
      db.prepare('UPDATE strategies SET name = :name, description = :description, checklist = :checklist, archived = :archived WHERE id = :id').run({ ...s, id });
      return getStrategy(db, id);
    }],
  ];
}
