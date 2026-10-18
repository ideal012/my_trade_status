import { accountRoutes } from './accounts.js';
import { strategyRoutes } from './strategies.js';
import { tradeRoutes } from './trades.js';

// Each route: [method, '/api/path/:id', async ({ params, query, body }) => object | Reply]
export function buildRoutes(db, dataDir) {
  return [
    ['GET', '/api/health', () => ({ ok: true })],
    ...accountRoutes(db),
    ...strategyRoutes(db),
    ...tradeRoutes(db),
  ];
}
