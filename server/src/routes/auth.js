import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { one, q, tx } from '../db.js';
import { sign, requireAuth, h, fail } from '../lib/auth.js';
import { rateLimit } from '../lib/rate-limit.js';

const r = Router();

r.post('/login', rateLimit({ windowMs: 15 * 60_000, limit: 10, key: req => `login:${req.ip}`, message: 'Too many login attempts. Wait 15 minutes and try again.' }), h(async (req, res) => {
  const { email, password } = req.body || {};
  const u = await one(`SELECT * FROM users WHERE lower(email) = lower($1) AND active ORDER BY created_at LIMIT 1`, [email || '']);
  if (!u || !(await bcrypt.compare(password || '', u.password_hash))) throw fail(401, 'Wrong email or password');
  await q(`UPDATE users SET last_login = now() WHERE id = $1`, [u.id]);
  res.json({ token: sign(u), user: { id: u.id, name: u.name, role: u.role, email: u.email } });
}));

/** First-time setup: creates the builder org and its admin. Disabled once any org exists unless ALLOW_SIGNUP=1. */
r.post('/setup', rateLimit({ windowMs: 60 * 60_000, limit: 5, key: req => `setup:${req.ip}`, message: 'Too many setup attempts. Try again in an hour.' }), h(async (req, res) => {
  const { company, name, email, password, phone } = req.body || {};
  if (typeof company !== 'string' || !company.trim() || company.length > 160 || typeof email !== 'string' || !email.trim() || email.length > 254 || typeof password !== 'string' || password.length < 8 || password.length > 1024) {
    throw fail(400, 'Company, email and a password of 8 to 1024 characters are required');
  }
  if (name !== undefined && (typeof name !== 'string' || name.length > 160)) throw fail(400, 'Name must be at most 160 characters');
  if (phone !== undefined && phone !== null && (typeof phone !== 'string' || phone.length > 40)) throw fail(400, 'Phone must be at most 40 characters');
  const emailClean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean)) throw fail(400, 'Enter a valid email address');
  const passwordHash = await bcrypt.hash(password, 10);
  const u = await tx(async t => {
    if (process.env.ALLOW_SIGNUP !== '1') {
      await t.q(`SELECT pg_advisory_xact_lock(hashtext('nivaas:first-org-setup'))`);
      if (await t.one(`SELECT 1 FROM orgs LIMIT 1`)) throw fail(403, 'Setup is already done. Ask your admin for an account.');
    }
    const org = await t.one(`INSERT INTO orgs (name, phone, email) VALUES ($1,$2,$3) RETURNING *`, [company.trim(), phone || null, emailClean]);
    return t.one(`INSERT INTO users (org_id, role, name, email, phone, password_hash) VALUES ($1,'admin',$2,$3,$4,$5) RETURNING *`,
      [org.id, name?.trim() || company.trim(), emailClean, phone || null, passwordHash]);
  });
  res.json({ token: sign(u), user: { id: u.id, name: u.name, role: u.role, email: u.email } });
}));

r.post('/password', requireAuth, h(async (req, res) => {
  const { current, next } = req.body || {};
  const u = await one(`SELECT * FROM users WHERE id = $1`, [req.user.id]);
  if (!(await bcrypt.compare(current || '', u.password_hash))) throw fail(400, 'Current password is wrong');
  if (!next || next.length < 8) throw fail(400, 'New password must be 8+ characters');
  await q(`UPDATE users SET password_hash = $2 WHERE id = $1`, [u.id, await bcrypt.hash(next, 10)]);
  res.sendStatus(204);
}));

export default r;
