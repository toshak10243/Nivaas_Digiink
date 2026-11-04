// Who am I, dashboard numbers, notifications, team & settings (admin)
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { one, many, q } from '../db.js';
import { h, allow, fail } from '../lib/auth.js';
import { settingsOf, merge } from '../settings.js';
import { config } from '../config.js';

const r = Router();
const USER_COLS = 'id, role, name, email, phone, active, profile, last_login, created_at';

r.get('/me', h(async (req, res) => {
  const user = await one(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [req.user.id]);
  const org = await one(`SELECT id, name, logo_url, phone, email, address, rera_promoter, settings FROM orgs WHERE id = $1`, [req.user.org]);
  org.settings = settingsOf(org);
  const wa = await one(`SELECT id, display FROM wa_numbers WHERE user_id = $1`, [req.user.id]);
  res.json({ user: { ...user, whatsapp: wa }, org, publicUrl: config.publicUrl });
}));

/** Sales agents set their own availability and AI twin. */
r.patch('/me/profile', h(async (req, res) => {
  const { availability, ai_twin, phone } = req.body || {};
  const u = await one(`SELECT profile FROM users WHERE id = $1`, [req.user.id]);
  const profile = { ...u.profile };
  if (availability) profile.availability = availability;
  if (ai_twin) profile.ai_twin = { ...(profile.ai_twin || {}), ...ai_twin };
  const row = await one(`UPDATE users SET profile = $2, phone = COALESCE($3, phone) WHERE id = $1 RETURNING ${USER_COLS}`, [req.user.id, profile, phone || null]);
  res.json(row);
}));

// ---------- Dashboard ----------
r.get('/dashboard', h(async (req, res) => {
  const { org, id, role } = req.user;
  const month = `date_trunc('month', now())`;
  if (role === 'admin') {
    const inv = await many(`SELECT u.status, count(*)::int AS n FROM units u JOIN projects p ON p.id = u.project_id WHERE p.org_id = $1 GROUP BY 1`, [org]);
    const sales = await one(`SELECT count(*)::int AS units, coalesce(sum(deal_value),0) AS value FROM bookings WHERE org_id = $1 AND status <> 'cancelled' AND booking_date >= ${month}`, [org]);
    const collected = await one(`SELECT coalesce(sum(p.amount),0) AS amount FROM payments p JOIN bookings b ON b.id = p.booking_id WHERE b.org_id = $1 AND p.paid_on >= ${month}`, [org]);
    const pipeline = await many(`SELECT stage, count(*)::int AS n FROM leads WHERE org_id = $1 GROUP BY 1`, [org]);
    const visits = await many(`SELECT v.id, v.lead_id, v.scheduled_at, v.status, v.visitors_count, v.transport, l.name, l.phone, u.name AS agent FROM site_visits v JOIN leads l ON l.id = v.lead_id LEFT JOIN users u ON u.id = v.agent_id
                               WHERE v.org_id = $1 AND v.status IN ('scheduled', 'confirmed') AND v.scheduled_at > now() - interval '2 hours' ORDER BY v.scheduled_at LIMIT 8`, [org]);
    const followups = await many(`SELECT l.id, l.name, l.phone, l.stage, l.temperature, l.followup_at, l.followup_type, l.followup_note, u.name AS agent
                                  FROM leads l LEFT JOIN users u ON u.id = l.assigned_to
                                  WHERE l.org_id = $1 AND l.followup_at IS NOT NULL AND l.stage NOT IN ('booked', 'lost')
                                  ORDER BY l.followup_at ASC LIMIT 8`, [org]);
    const tickets = await one(`SELECT count(*) FILTER (WHERE status IN ('open','in_progress'))::int AS open, count(*) FILTER (WHERE status IN ('open','in_progress') AND sla_due_at < now())::int AS late FROM tickets WHERE org_id = $1`, [org]);
    const board = await many(`SELECT u.id, u.name, u.role, count(b.id)::int AS units, coalesce(sum(b.deal_value),0) AS value
                              FROM users u LEFT JOIN bookings b ON (b.sold_by = u.id OR b.broker_id = u.id) AND b.status <> 'cancelled' AND b.booking_date >= ${month}
                              WHERE u.org_id = $1 AND u.role IN ('sales','broker') AND u.active GROUP BY u.id ORDER BY units DESC, value DESC LIMIT 8`, [org]);
    const trend = await many(`SELECT to_char(d, 'YYYY-MM') AS month, coalesce(sum(b.deal_value),0) AS value, count(b.id)::int AS units
                              FROM generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') d
                              LEFT JOIN bookings b ON b.org_id = $1 AND b.status <> 'cancelled' AND date_trunc('month', b.booking_date) = d GROUP BY 1 ORDER BY 1`, [org]);
    return res.json({ role, inventory: inv, sales, collected: collected.amount, pipeline, visits, followups, tickets, leaderboard: board, trend });
  }
  if (role === 'sales' || role === 'broker') {
    const mine = role === 'sales' ? 'assigned_to = $2' : '(assigned_to = $2 OR broker_id = $2)';
    const pipeline = await many(`SELECT stage, count(*)::int AS n FROM leads WHERE org_id = $1 AND ${mine} GROUP BY 1`, [org, id]);
    const visits = await many(`SELECT v.id, v.scheduled_at, v.status, v.visitors_count, v.transport, l.name, l.phone, l.id AS lead_id FROM site_visits v JOIN leads l ON l.id = v.lead_id
                               WHERE v.org_id = $1 AND (v.agent_id = $2 OR l.broker_id = $2) AND v.status IN ('scheduled', 'confirmed') ORDER BY v.scheduled_at LIMIT 8`, [org, id]);
    const followups = await many(`SELECT l.id, l.name, l.phone, l.stage, l.temperature, l.followup_at, l.followup_type, l.followup_note
                                  FROM leads l
                                  WHERE l.org_id = $1 AND ${mine} AND l.followup_at IS NOT NULL AND l.stage NOT IN ('booked', 'lost')
                                  ORDER BY l.followup_at ASC LIMIT 8`, [org, id]);
    const sold = await one(`SELECT count(*)::int AS units, coalesce(sum(deal_value),0) AS value FROM bookings WHERE org_id = $1 AND (sold_by = $2 OR broker_id = $2) AND status <> 'cancelled' AND booking_date >= ${month}`, [org, id]);
    const earn = await one(`SELECT coalesce(sum(amount) FILTER (WHERE status IN ('pending','approved')),0) AS pending, coalesce(sum(amount) FILTER (WHERE status = 'paid'),0) AS paid,
                              coalesce(sum(amount) FILTER (WHERE created_at >= ${month} AND status <> 'void'),0) AS month FROM commissions WHERE user_id = $1`, [id]);
    const waiting = await many(`SELECT c.id, l.name, l.phone, c.last_customer_at FROM chats c JOIN leads l ON l.id = c.lead_id
                                WHERE c.agent_id = $1 AND c.last_customer_at IS NOT NULL AND (c.last_agent_at IS NULL OR c.last_agent_at < c.last_customer_at)
                                AND NOT EXISTS (SELECT 1 FROM chat_messages m WHERE m.chat_id = c.id AND m.sender = 'ai' AND m.created_at > c.last_customer_at) ORDER BY c.last_customer_at DESC LIMIT 6`, [id]);
    const me = await one(`SELECT profile FROM users WHERE id = $1`, [id]);
    return res.json({ role, pipeline, visits, followups, sold, earnings: earn, waiting, target: me.profile?.target_units || 0 });
  }
  if (role === 'maintenance') {
    const t = await one(`SELECT count(*) FILTER (WHERE status IN ('open','in_progress'))::int AS open, count(*) FILTER (WHERE status IN ('open','in_progress') AND assigned_to = $2)::int AS mine,
                           count(*) FILTER (WHERE status IN ('open','in_progress') AND sla_due_at < now())::int AS late,
                           count(*) FILTER (WHERE status IN ('resolved','closed') AND resolved_at > now() - interval '7 days')::int AS resolved_week FROM tickets WHERE org_id = $1`, [org, id]);
    return res.json({ role, tickets: t });
  }
  res.json({ role });
}));

// ---------- Notifications ----------
r.get('/notifications', h(async (req, res) => {
  res.json(await many(`SELECT * FROM notifications WHERE org_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 60`, [req.user.org, req.user.id]));
}));
r.post('/notifications/read', h(async (req, res) => {
  await q(`UPDATE notifications SET read = true WHERE user_id = $1`, [req.user.id]); res.sendStatus(204);
}));

// ---------- Team (admin) ----------
r.get('/team', h(async (req, res) => {
  const role = req.query.role;
  if (req.user.role !== 'admin' && role !== 'sales') throw fail(403, 'Admins only');
  const rows = await many(
    `SELECT ${USER_COLS.split(', ').map(c => 'u.' + c).join(', ')}, w.display AS whatsapp,
       (SELECT count(*)::int FROM leads l WHERE l.assigned_to = u.id AND l.stage NOT IN ('booked','lost')) AS open_leads,
       (SELECT count(*)::int FROM bookings b WHERE (b.sold_by = u.id OR b.broker_id = u.id) AND b.status <> 'cancelled') AS units_sold
     FROM users u LEFT JOIN wa_numbers w ON w.user_id = u.id
     WHERE u.org_id = $1 ${role ? 'AND u.role = $2' : ''} ORDER BY u.role, u.name`, role ? [req.user.org, role] : [req.user.org]);
  res.json(req.user.role === 'admin' ? rows : rows.map(({ profile, ...u }) => ({ ...u, profile: { availability: profile.availability } })));
}));

r.post('/team', allow('admin'), h(async (req, res) => {
  const { role, name, email, phone, profile = {} } = req.body || {};
  if (!['admin', 'sales', 'broker', 'maintenance', 'customer'].includes(role)) throw fail(400, 'Pick a role');
  if (!name || !email) throw fail(400, 'Name and email are required');
  const temp = req.body.password || crypto.randomBytes(5).toString('base64url');
  const u = await one(`INSERT INTO users (org_id, role, name, email, phone, password_hash, profile) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${USER_COLS}`,
    [req.user.org, role, name, email.trim(), phone, await bcrypt.hash(temp, 10), defaultsFor(role, profile)]);
  res.json({ ...u, temp_password: temp });
}));

r.patch('/team/:id', allow('admin'), h(async (req, res) => {
  const { name, email, phone, active, profile } = req.body || {};
  const cur = await one(`SELECT * FROM users WHERE id = $1 AND org_id = $2`, [req.params.id, req.user.org]);
  if (!cur) throw fail(404, 'Not found');
  const u = await one(`UPDATE users SET name = COALESCE($2,name), email = COALESCE($3,email), phone = COALESCE($4,phone), active = COALESCE($5,active), profile = $6
                       WHERE id = $1 RETURNING ${USER_COLS}`, [cur.id, name, email, phone, active, merge(cur.profile, profile || {})]);
  res.json(u);
}));

r.post('/team/:id/reset-password', allow('admin'), h(async (req, res) => {
  const temp = crypto.randomBytes(5).toString('base64url');
  const u = await one(`UPDATE users SET password_hash = $3 WHERE id = $1 AND org_id = $2 RETURNING id`, [req.params.id, req.user.org, await bcrypt.hash(temp, 10)]);
  if (!u) throw fail(404, 'Not found');
  res.json({ temp_password: temp });
}));

function defaultsFor(role, p) {
  if (role === 'sales') return { salary: 25000, incentive: { type: 'percent', value: 0.25 }, target_units: 2, availability: 'available', ai_twin: { mode: 'away', reply_after_min: 5 }, ...p };
  if (role === 'broker') return { commission: { type: 'percent', value: 2 }, firm: '', rera_agent_no: '', ...p };
  return p;
}

// ---------- Org settings (admin) ----------
r.put('/org', allow('admin'), h(async (req, res) => {
  const { name, phone, email, address, rera_promoter, logo_url, settings } = req.body || {};
  const cur = await one(`SELECT settings FROM orgs WHERE id = $1`, [req.user.org]);
  const o = await one(`UPDATE orgs SET name = COALESCE($2,name), phone = COALESCE($3,phone), email = COALESCE($4,email), address = COALESCE($5,address),
                         rera_promoter = COALESCE($6,rera_promoter), logo_url = COALESCE($7,logo_url), settings = $8 WHERE id = $1
                       RETURNING id, name, logo_url, phone, email, address, rera_promoter, settings`,
    [req.user.org, name, phone, email, address, rera_promoter, logo_url, merge(cur.settings, settings || {})]);
  o.settings = settingsOf(o);
  res.json(o);
}));

// ---------- Integrations (admin) ----------
r.get('/integrations', allow('admin'), h(async (req, res) => {
  const org = await one(`SELECT id, bridge_secret FROM orgs WHERE id = $1`, [req.user.org]);
  const numbers = await many(`SELECT w.id, w.display, w.phone_number_id, w.user_id, u.name AS agent FROM wa_numbers w LEFT JOIN users u ON u.id = w.user_id WHERE w.org_id = $1 ORDER BY w.user_id NULLS FIRST`, [req.user.org]);
  res.json({
    leadsathi: { webhook_url: `${config.publicUrl}/bridge/leadsathi/${org.id}?secret=${org.bridge_secret}` },
    whatsapp: { webhook_url: `${config.publicUrl}/webhooks/whatsapp`, verify_token: config.meta.verifyToken, numbers },
  });
}));

/** Register a WhatsApp number (from Meta → WhatsApp Manager → Phone numbers). user_id empty = builder's main number. */
r.post('/integrations/whatsapp', allow('admin'), h(async (req, res) => {
  const { phone_number_id, access_token, display, user_id, waba_id } = req.body || {};
  if (!phone_number_id || !access_token) throw fail(400, 'Phone number ID and access token are required');
  const row = await one(`INSERT INTO wa_numbers (org_id, user_id, phone_number_id, waba_id, display, access_token) VALUES ($1,$2,$3,$4,$5,$6)
                         ON CONFLICT (phone_number_id) DO UPDATE SET user_id = EXCLUDED.user_id, display = EXCLUDED.display, access_token = EXCLUDED.access_token
                         RETURNING id, display, phone_number_id, user_id`, [req.user.org, user_id || null, phone_number_id, waba_id || null, display, access_token]);
  res.json(row);
}));
r.delete('/integrations/whatsapp/:id', allow('admin'), h(async (req, res) => {
  await q(`DELETE FROM wa_numbers WHERE id = $1 AND org_id = $2`, [req.params.id, req.user.org]); res.sendStatus(204);
}));
r.post('/integrations/rotate-secret', allow('admin'), h(async (req, res) => {
  await q(`UPDATE orgs SET bridge_secret = encode(gen_random_bytes(18), 'hex') WHERE id = $1`, [req.user.org]); res.sendStatus(204);
}));

export default r;
