import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { one, q } from '../db.js';
import { sign, requireAuth, h, fail } from '../lib/auth.js';

const r = Router();

r.post('/login', h(async (req, res) => {
  const { email, password } = req.body || {};
  const u = await one(`SELECT * FROM users WHERE lower(email) = lower($1) AND active ORDER BY created_at LIMIT 1`, [email || '']);
  if (!u || !(await bcrypt.compare(password || '', u.password_hash))) throw fail(401, 'Wrong email or password');
  await q(`UPDATE users SET last_login = now() WHERE id = $1`, [u.id]);
  res.json({ token: sign(u), user: { id: u.id, name: u.name, role: u.role, email: u.email } });
}));

/** First-time setup: creates the builder org and its admin. Disabled once any org exists unless ALLOW_SIGNUP=1. */
r.post('/setup', h(async (req, res) => {
  const any = await one(`SELECT 1 FROM orgs LIMIT 1`);
  if (any && process.env.ALLOW_SIGNUP !== '1') throw fail(403, 'Setup is already done. Ask your admin for an account.');
  const { company, name, email, password, phone } = req.body || {};
  if (!company || !email || !password || password.length < 8) throw fail(400, 'Company, email and a password of 8+ characters are required');
  const org = await one(`INSERT INTO orgs (name, phone, email) VALUES ($1,$2,$3) RETURNING *`, [company, phone, email]);
  const u = await one(`INSERT INTO users (org_id, role, name, email, phone, password_hash) VALUES ($1,'admin',$2,$3,$4,$5) RETURNING *`,
    [org.id, name || company, email, phone, await bcrypt.hash(password, 10)]);
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
