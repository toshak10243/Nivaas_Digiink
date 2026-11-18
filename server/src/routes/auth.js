import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { one, q, tx } from '../db.js';
import { sign, signRefresh, requireAuth, h, fail } from '../lib/auth.js';
import { rateLimit } from '../lib/rate-limit.js';
import { config } from '../config.js';
import { email as validEmail, phone as validPhone, text } from '../lib/validate.js';

const r = Router();

r.post('/login', rateLimit({ windowMs: 15 * 60_000, limit: 10, key: req => `login:${req.ip}`, message: 'Too many login attempts. Wait 15 minutes and try again.' }), h(async (req, res) => {
  const { email, password } = req.body || {};
  const emailClean = validEmail(email, 'Email', { optional: false });
  if (typeof password !== 'string' || password.length > 1024) throw fail(400, 'Password must be text of at most 1024 characters');
  const u = await one(`SELECT * FROM users WHERE lower(email) = lower($1) AND active ORDER BY created_at LIMIT 1`, [emailClean]);
  if (!u || !(await bcrypt.compare(password, u.password_hash))) throw fail(401, 'Wrong email or password');
  await q(`UPDATE users SET last_login = now() WHERE id = $1`, [u.id]);
  res.json({
    token: sign(u),
    refreshToken: signRefresh(u),
    expiresIn: config.jwtExpiresIn,
    user: { id: u.id, name: u.name, role: u.role, email: u.email, must_change_password: !!u.must_change_password }
  });
}));

r.post('/refresh', h(async (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) throw fail(401, 'Session expired. Please log in again.');
  let claims;
  try {
    claims = jwt.verify(refreshToken, config.jwtSecret);
  } catch {
    throw fail(401, 'Session expired. Please log in again.');
  }
  if (!claims || claims.type !== 'refresh' || !claims.uid || !claims.org) throw fail(401, 'Session expired. Please log in again.');
  const u = await one(`SELECT * FROM users WHERE id = $1 AND org_id = $2 AND active`, [claims.uid, claims.org]);
  if (!u) throw fail(401, 'Session expired. Please log in again.');
  res.json({
    token: sign(u),
    refreshToken: signRefresh(u),
    expiresIn: config.jwtExpiresIn,
    user: { id: u.id, name: u.name, role: u.role, email: u.email, must_change_password: !!u.must_change_password }
  });
}));

/** First-time setup: creates the builder org and its admin. Disabled once any org exists unless ALLOW_SIGNUP=1. */
r.post('/setup', rateLimit({ windowMs: 60 * 60_000, limit: 5, key: req => `setup:${req.ip}`, message: 'Too many setup attempts. Try again in an hour.' }), h(async (req, res) => {
  const { company, name, email, password, phone } = req.body || {};
  const companyClean = text(company, 'Company', { optional: false, max: 160 });
  const emailClean = validEmail(email, 'Email', { optional: false });
  if (typeof password !== 'string' || password.length < 8 || password.length > 1024) throw fail(400, 'Password must be 8 to 1024 characters');
  const nameClean = text(name, 'Name', { max: 160 });
  const phoneClean = validPhone(phone, 'Phone');
  const passwordHash = await bcrypt.hash(password, 10);
  const u = await tx(async t => {
    if (process.env.ALLOW_SIGNUP !== '1') {
      await t.q(`SELECT pg_advisory_xact_lock(hashtext('nivaas:first-org-setup'))`);
      if (await t.one(`SELECT 1 FROM orgs LIMIT 1`)) throw fail(403, 'Setup is already done. Ask your admin for an account.');
    }
    const org = await t.one(`INSERT INTO orgs (name, phone, email) VALUES ($1,$2,$3) RETURNING *`, [companyClean, phoneClean || null, emailClean]);
    return t.one(`INSERT INTO users (org_id, role, name, email, phone, password_hash) VALUES ($1,'admin',$2,$3,$4,$5) RETURNING *`,
      [org.id, nameClean || companyClean, emailClean, phoneClean || null, passwordHash]);
  });
  res.json({ token: sign(u), refreshToken: signRefresh(u), expiresIn: config.jwtExpiresIn, user: { id: u.id, name: u.name, role: u.role, email: u.email } });
}));

r.post('/password', requireAuth, h(async (req, res) => {
  const { current, next } = req.body || {};
  const u = await one(`SELECT * FROM users WHERE id = $1`, [req.user.id]);
  if (typeof current !== 'string' || !current || current.length > 1024) throw fail(400, 'Current password is required');
  if (!(await bcrypt.compare(current, u.password_hash))) throw fail(400, 'Current password is wrong');
  if (typeof next !== 'string' || next.length < 8 || next.length > 1024) throw fail(400, 'New password must be 8 to 1024 characters');
  await q(`UPDATE users SET password_hash = $2, must_change_password = false WHERE id = $1`, [u.id, await bcrypt.hash(next, 10)]);
  res.sendStatus(204);
}));

export default r;
