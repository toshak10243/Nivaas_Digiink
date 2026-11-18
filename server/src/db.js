import { getActivePool, defaultPool, masterDb, runWithTenant, tenantStorage } from './lib/tenant-db.js';

// Export default pool for legacy references
export const pool = defaultPool;

// Dynamic queries routed to the active tenant's isolated database via AsyncLocalStorage
export const q = (text, params) => getActivePool().query(text, params);
export const one = async (text, params) => (await getActivePool().query(text, params)).rows[0] || null;
export const many = async (text, params) => (await getActivePool().query(text, params)).rows;

/** Run several statements atomically on the active tenant's database. */
export async function tx(fn) {
  const activePool = getActivePool();
  const c = await activePool.connect();
  try {
    await c.query('BEGIN');
    const helpers = {
      q: (t, p) => c.query(t, p),
      one: async (t, p) => (await c.query(t, p)).rows[0] || null,
      many: async (t, p) => (await c.query(t, p)).rows,
    };
    const out = await fn(helpers);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

export { masterDb, runWithTenant, tenantStorage };
