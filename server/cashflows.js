import { HttpError } from './http.js';

// Deposits (amount > 0) and withdrawals (amount < 0). They change equity, never profit or drawdown.
function cleanFlow(db, b = {}) {
  const account_id = Number(b.account_id);
  const amount = b.amount === '' || b.amount == null ? NaN : Number(b.amount);
  const ok = typeof b.time_utc === 'string' && Number.isFinite(Date.parse(b.time_utc));
  if (!db.prepare('SELECT 1 FROM accounts WHERE id = ?').get(account_id)) throw new HttpError(400, 'ไม่พบบัญชีนี้');
  if (!Number.isFinite(amount) || amount === 0) throw new HttpError(400, 'จำนวนเงินต้องเป็นตัวเลขที่ไม่ใช่ 0 (ฝาก = บวก, ถอน = ลบ)');
  if (!ok) throw new HttpError(400, 'กรอกเวลาให้ถูกต้อง');
  return { account_id, amount, time_utc: new Date(b.time_utc).toISOString(), note: String(b.note ?? '').trim().slice(0, 200) };
}

export function cashflowRoutes(db) {
  return [
    ['GET', '/api/cashflows', ({ query }) => db.prepare('SELECT * FROM cashflows WHERE account_id = ? ORDER BY time_utc, id').all(Number(query.get('account_id')))],
    ['POST', '/api/cashflows', ({ body }) => {
      const id = db.prepare('INSERT INTO cashflows (account_id, time_utc, amount, note) VALUES (:account_id, :time_utc, :amount, :note)').run(cleanFlow(db, body ?? {})).lastInsertRowid;
      return db.prepare('SELECT * FROM cashflows WHERE id = ?').get(Number(id));
    }],
    ['DELETE', '/api/cashflows/:id', ({ params }) => {
      if (!db.prepare('DELETE FROM cashflows WHERE id = ?').run(Number(params.id)).changes) throw new HttpError(404, 'ไม่พบรายการนี้');
      return {};
    }],
  ];
}
