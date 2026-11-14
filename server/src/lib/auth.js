import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { one } from '../db.js';

export const sign = (u, expiresIn = config.jwtExpiresIn || '30d') =>
  jwt.sign({ uid: u.id, org: u.org_id, role: u.role, name: u.name }, config.jwtSecret, { expiresIn });

export const signRefresh = (u, expiresIn = config.jwtRefreshExpiresIn || '30d') =>
  jwt.sign({ uid: u.id, org: u.org_id, role: u.role, type: 'refresh' }, config.jwtSecret, { expiresIn });

export function requireAuth(req, res, next) {
  const raw = req.get('authorization')?.replace(/^Bearer /, '') || req.query.token;
  let claims;
  try {
    claims = jwt.verify(raw, config.jwtSecret);
  } catch (err) {
    const isExpired = err?.name === 'TokenExpiredError';
    return res.status(401).json({
      error: isExpired ? 'Session expired. Please log in again.' : 'Please log in again',
      code: isExpired ? 'SESSION_EXPIRED' : 'AUTH_REQUIRED'
    });
  }
  one(`SELECT id, org_id, role, name FROM users WHERE id = $1 AND org_id = $2 AND active`, [claims.uid, claims.org])
    .then(user => {
      if (!user) return res.status(401).json({ error: 'Session expired. Please log in again.', code: 'USER_INACTIVE' });
      req.user = { id: user.id, org: user.org_id, role: user.role, name: user.name };
      next();
    })
    .catch(next);
}

/** allow('admin','sales') → 403 for everyone else */
export const allow = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'You do not have access to this' });

/** Wraps async route handlers so thrown errors become JSON 500s (or 4xx if err.status). */
export const h = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(e => {
  if (e.code === '23505') return res.status(409).json({ error: 'This already exists (duplicate).' });
  if (!e.status) console.error('[route]', req.method, req.path, e);
  res.status(e.status || 500).json({ error: e.status ? e.message : 'Something went wrong. Please try again.' });
});

export const fail = (status, message) => Object.assign(new Error(message), { status });
