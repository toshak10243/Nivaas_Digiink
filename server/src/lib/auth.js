import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export const sign = u => jwt.sign({ uid: u.id, org: u.org_id, role: u.role, name: u.name }, config.jwtSecret, { expiresIn: '30d' });

export function requireAuth(req, res, next) {
  const raw = req.get('authorization')?.replace(/^Bearer /, '') || req.query.token;
  try {
    const p = jwt.verify(raw, config.jwtSecret);
    req.user = { id: p.uid, org: p.org, role: p.role, name: p.name };
    next();
  } catch {
    res.status(401).json({ error: 'Please log in again' });
  }
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
