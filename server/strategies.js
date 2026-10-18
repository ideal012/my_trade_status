export const parseStrategy = (r) => ({ ...r, checklist: JSON.parse(r.checklist), archived: !!r.archived });

export function strategyRoutes(db) {
  return [
    ['GET', '/api/strategies', () => db.prepare('SELECT * FROM strategies ORDER BY archived, name').all().map(parseStrategy)],
  ];
}
