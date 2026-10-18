export function accountRoutes(db) {
  return [
    ['GET', '/api/accounts', () => db.prepare('SELECT * FROM accounts ORDER BY id').all()],
    ['GET', '/api/settings', () => Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map((r) => [r.key, r.value]))],
  ];
}
