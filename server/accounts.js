import { HttpError } from './http.js';

const getAccount = (db, id) => {
  const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
  if (!row) throw new HttpError(404, 'ไม่พบบัญชีนี้');
  return row;
};

export const KINDS = ['backtest', 'replay', 'demo', 'live'];

function cleanAccount(body, base = {}) {
  const b = { ...base, ...body };
  const name = String(b.name ?? '').trim().slice(0, 60);
  const currency = String(b.currency ?? 'USD').trim().toUpperCase();
  const capital = Number(b.initial_capital ?? 0);
  if (!name) throw new HttpError(400, 'กรอกชื่อบัญชี');
  if (!/^[A-Z]{1,8}$/.test(currency)) throw new HttpError(400, 'สกุลเงินต้องเป็นตัวอักษรภาษาอังกฤษ เช่น USD');
  if (!Number.isFinite(capital) || capital < 0) throw new HttpError(400, 'ทุนเริ่มต้นต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป');
  const kind = b.kind ?? 'live';
  if (!KINDS.includes(kind)) throw new HttpError(400, 'ประเภทบัญชีต้องเป็น backtest, replay, demo หรือ live');
  return { name, currency, initial_capital: capital, kind };
}

const settings = (db) => Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map((r) => [r.key, r.value]));

export function accountRoutes(db) {
  return [
    ['GET', '/api/accounts', () => db.prepare('SELECT * FROM accounts ORDER BY id').all()],
    ['POST', '/api/accounts', ({ body }) => {
      const a = cleanAccount(body ?? {});
      const id = db.prepare('INSERT INTO accounts (name, currency, initial_capital, kind) VALUES (:name, :currency, :initial_capital, :kind)').run(a).lastInsertRowid;
      return getAccount(db, Number(id));
    }],
    ['PUT', '/api/accounts/:id', ({ params, body }) => {
      const id = Number(params.id);
      const a = cleanAccount(body ?? {}, getAccount(db, id));
      db.prepare('UPDATE accounts SET name = :name, currency = :currency, initial_capital = :initial_capital, kind = :kind WHERE id = :id').run({ ...a, id });
      return getAccount(db, id);
    }],
    ['DELETE', '/api/accounts/:id', ({ params }) => {
      const id = Number(params.id);
      getAccount(db, id);
      if (db.prepare('SELECT COUNT(*) AS n FROM accounts').get().n <= 1) throw new HttpError(400, 'ต้องมีอย่างน้อย 1 บัญชี');
      const n = db.prepare('SELECT COUNT(*) AS n FROM trades WHERE account_id = ?').get(id).n;
      if (n) throw new HttpError(400, `ลบไม่ได้ เพราะบัญชีนี้ยังมี ${n} เทรด (ลบเทรดทั้งหมดก่อน หรือเปลี่ยนชื่อบัญชีแทน)`);
      db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
      return {};
    }],
    ['GET', '/api/settings', () => settings(db)],
    ['PUT', '/api/settings', ({ body }) => {
      if (body?.timezone !== undefined) {
        try {
          new Intl.DateTimeFormat('en', { timeZone: String(body.timezone) });
        } catch {
          throw new HttpError(400, 'ไม่รู้จัก timezone นี้');
        }
        db.prepare("INSERT INTO settings (key, value) VALUES ('timezone', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(body.timezone));
      }
      if (body?.max_risk_pct !== undefined) {
        const pct = Number(body.max_risk_pct);
        if (body.max_risk_pct === '' || !Number.isFinite(pct) || pct <= 0 || pct > 100) throw new HttpError(400, 'กฎความเสี่ยงต้องเป็นตัวเลขมากกว่า 0 และไม่เกิน 100 (%)');
        db.prepare("INSERT INTO settings (key, value) VALUES ('max_risk_pct', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(pct));
      }
      return settings(db);
    }],
  ];
}
