import pg from 'pg';
import { config } from './config.js';

pg.types.setTypeParser(1700, v => (v === null ? null : Number(v))); // numeric → number

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 15 });
export const q = (text, params) => pool.query(text, params);
export const one = async (text, params) => (await pool.query(text, params)).rows[0] || null;
export const many = async (text, params) => (await pool.query(text, params)).rows;

/** Run several statements atomically. */
export async function tx(fn) {
  const c = await pool.connect();
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
