// Who am I, dashboard numbers, notifications, team & settings (admin)
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { one, many, q } from '../db.js';
import { h, allow, fail } from '../lib/auth.js';
import { settingsOf, merge, validateSettings } from '../settings.js';
import { config } from '../config.js';
import { maskPhoneRows } from '../lib/privacy.js';
import { avatarUpload, privateFileKey, verifyUploadedFiles } from './projects.js';
import { privateFileUrl } from './private-files.js';
import { email as validEmail, phone as validPhone, text, number, oneOf, record, uuid } from '../lib/validate.js';

const r = Router();
const USER_COLS = 'id, role, name, email, phone, active, profile, last_login, must_change_password, created_at';

function withPrivateAvatar(user, viewer) {
  if (!user) return user;
  const profile = { ...(user.profile || {}) };
  if (profile.avatar_path) profile.avatar_url = privateFileUrl('avatars', user.id, viewer);
  delete profile.avatar_path;
  return { ...user, profile };
}

async function assertOrgUser(id, org, roles) {
  const user = await one(`SELECT id, role, active FROM users WHERE id = $1 AND org_id = $2`, [id, org]);
  if (!user || !user.active || (roles && !roles.includes(user.role))) throw fail(400, 'Selected team member must be active and belong to this organization');
}

r.get('/me', h(async (req, res) => {
  const user = await one(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [req.user.id]);
  const org = await one(`SELECT id, name, logo_url, phone, email, address, rera_promoter, settings FROM orgs WHERE id = $1`, [req.user.org]);
  org.settings = settingsOf(org);
  const wa = await one(`SELECT id, display FROM wa_numbers WHERE user_id = $1`, [req.user.id]);
  res.json({ user: { ...withPrivateAvatar(user, req.user), whatsapp: wa }, org, publicUrl: config.publicUrl });
}));

/** Sales agents set their own availability and AI twin. */
r.patch('/me/profile', h(async (req, res) => {
  const { availability, ai_twin } = req.body || {};
  const body = req.body || {};
  const allowed = ['name', 'email', 'phone', 'availability', 'ai_twin'];
  if (Object.keys(body).some(k => !allowed.includes(k))) throw fail(400, 'Unsupported profile field');
  const name = body.name === undefined ? null : text(body.name, 'Name', { optional: false, max: 160 });
  const email = body.email === undefined ? null : validEmail(body.email, 'Email', { optional: false });
  const phone = body.phone === undefined ? null : validPhone(body.phone, 'Phone');
  if (availability !== undefined) oneOf(availability, 'Availability', ['available', 'busy', 'away'], { optional: false });
  const safeAiTwin = ai_twin === undefined ? undefined : validateAiTwin(ai_twin);
  const u = await one(`SELECT profile FROM users WHERE id = $1`, [req.user.id]);
  if (email) {
    const duplicate = await one(`SELECT id FROM users WHERE org_id = $1 AND lower(email) = $2 AND id <> $3`, [req.user.org, email, req.user.id]);
    if (duplicate) throw fail(409, 'That email address is already used by another account in this company');
  }
  const profile = { ...u.profile };
  if (availability) profile.availability = availability;
  if (safeAiTwin) profile.ai_twin = { ...(profile.ai_twin || {}), ...safeAiTwin };
  const row = await one(`UPDATE users SET profile = $2, name = COALESCE($3, name), email = COALESCE($4, email), phone = COALESCE($5, phone) WHERE id = $1 RETURNING ${USER_COLS}`,
    [req.user.id, profile, name || null, email || null, phone || null]);
  res.json(withPrivateAvatar(row, req.user));
}));

r.post('/me/avatar', avatarUpload.array('files', 1), verifyUploadedFiles, h(async (req, res) => {
  const file = req.files?.[0];
  if (!file) throw fail(400, 'Choose a profile picture to upload');
  const u = await one(`SELECT profile FROM users WHERE id = $1`, [req.user.id]);
  const profile = { ...u.profile, avatar_path: privateFileKey(req, file) };
  delete profile.avatar_url;
  const row = await one(`UPDATE users SET profile = $2 WHERE id = $1 RETURNING ${USER_COLS}`, [req.user.id, profile]);
  const user = withPrivateAvatar(row, req.user);
  res.json({ avatar_url: user.profile.avatar_url, profile: user.profile });
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
    return res.json({ role, pipeline,
      visits: maskPhoneRows(visits, 'phone', role), followups: maskPhoneRows(followups, 'phone', role), sold, earnings: earn,
      waiting: maskPhoneRows(waiting, 'phone', role), target: me.profile?.target_units || 0 });
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
  if (role !== undefined && !['admin', 'sales', 'broker', 'maintenance', 'customer'].includes(role)) throw fail(400, 'Unknown team role');
  if (req.user.role !== 'admin' && role !== 'sales') throw fail(403, 'Admins only');
  const rows = await many(
    `SELECT ${USER_COLS.split(', ').map(c => 'u.' + c).join(', ')}, w.display AS whatsapp,
       (SELECT count(*)::int FROM leads l WHERE l.assigned_to = u.id AND l.stage NOT IN ('booked','lost')) AS open_leads,
       (SELECT count(*)::int FROM bookings b WHERE (b.sold_by = u.id OR b.broker_id = u.id) AND b.status <> 'cancelled') AS units_sold
     FROM users u LEFT JOIN wa_numbers w ON w.user_id = u.id
     WHERE u.org_id = $1 ${role ? 'AND u.role = $2' : ''} ORDER BY u.role, u.name`, role ? [req.user.org, role] : [req.user.org]);
  const visibleRows = req.user.role === 'admin' ? rows : rows.map(({ profile, ...u }) => ({ ...u, profile: { availability: profile.availability } }));
  res.json(visibleRows.map(user => withPrivateAvatar(user, req.user)));
}));

r.post('/team', allow('admin'), h(async (req, res) => {
  const { role, name, email, phone, profile = {} } = req.body || {};
  if (!['admin', 'sales', 'broker', 'maintenance', 'customer'].includes(role)) throw fail(400, 'Pick a role');
  const cleanName = text(name, 'Name', { optional: false, max: 160 });
  const cleanEmail = validEmail(email, 'Email', { optional: false });
  const cleanPhone = validPhone(phone, 'Phone');
  const cleanProfile = validateTeamProfile(role, profile);
  const temp = req.body.password === undefined ? crypto.randomBytes(5).toString('base64url') : req.body.password;
  if (typeof temp !== 'string' || temp.length < 8 || temp.length > 1024) throw fail(400, 'Password must be 8 to 1024 characters');
  const u = await one(`INSERT INTO users (org_id, role, name, email, phone, password_hash, profile) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${USER_COLS}`,
    [req.user.org, role, cleanName, cleanEmail, cleanPhone || null, await bcrypt.hash(temp, 10), defaultsFor(role, cleanProfile)]);
  res.json({ ...withPrivateAvatar(u, req.user), temp_password: temp });
}));

r.patch('/team/:id', allow('admin'), h(async (req, res) => {
  const { name, email, phone, active, profile } = req.body || {};
  uuid(req.params.id, 'Team member ID');
  if (Object.keys(req.body || {}).some(key => !['name', 'email', 'phone', 'active', 'profile'].includes(key))) throw fail(400, 'Unsupported team member field');
  const cur = await one(`SELECT * FROM users WHERE id = $1 AND org_id = $2`, [req.params.id, req.user.org]);
  if (!cur) throw fail(404, 'Not found');
  const cleanName = name === undefined ? null : text(name, 'Name', { optional: false, max: 160 });
  const cleanEmail = email === undefined ? null : validEmail(email, 'Email', { optional: false });
  const cleanPhone = phone === undefined ? null : (validPhone(phone, 'Phone') || null);
  if (active !== undefined && typeof active !== 'boolean') throw fail(400, 'Active must be true or false');
  const safeProfile = profile === undefined ? cur.profile : merge(cur.profile, validateTeamProfile(cur.role, profile));
  const u = await one(`UPDATE users SET name = COALESCE($2,name), email = COALESCE($3,email), phone = COALESCE($4,phone), active = COALESCE($5,active), profile = $6
                       WHERE id = $1 RETURNING ${USER_COLS}`, [cur.id, cleanName, cleanEmail, cleanPhone, active, safeProfile]);
  res.json(withPrivateAvatar(u, req.user));
}));

r.post('/team/:id/reset-password', allow('admin'), h(async (req, res) => {
  uuid(req.params.id, 'Team member ID');
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

function validateAiTwin(value) {
  record(value, 'AI twin settings');
  const allowed = ['mode', 'reply_after_min'];
  if (Object.keys(value).some(k => !allowed.includes(k))) throw fail(400, 'Unsupported AI twin setting');
  const out = {};
  if (value.mode !== undefined) out.mode = oneOf(value.mode, 'AI twin mode', ['off', 'away', 'always'], { optional: false });
  if (value.reply_after_min !== undefined) out.reply_after_min = number(value.reply_after_min, 'AI reply delay', { min: 0, max: 1440, integer: true, optional: false });
  return out;
}

function validateTeamProfile(role, profile) {
  record(profile, 'Team profile');
  const keys = {
    sales: ['salary', 'target_units', 'incentive', 'availability', 'ai_twin'],
    broker: ['firm', 'rera_agent_no', 'commission'],
    maintenance: ['skills'], admin: [], customer: []
  }[role];
  if (Object.keys(profile).some(k => !keys.includes(k))) throw fail(400, 'Unsupported field in team profile');
  const out = {};
  if (role === 'sales') {
    if (profile.salary !== undefined) out.salary = number(profile.salary, 'Monthly salary', { min: 0, max: 100_000_000, optional: false });
    if (profile.target_units !== undefined) out.target_units = number(profile.target_units, 'Monthly target', { min: 0, max: 1000, integer: true, optional: false });
    if (profile.incentive !== undefined) out.incentive = validateRate(profile.incentive, 'Incentive');
    if (profile.availability !== undefined) out.availability = oneOf(profile.availability, 'Availability', ['available', 'busy', 'away'], { optional: false });
    if (profile.ai_twin !== undefined) out.ai_twin = validateAiTwin(profile.ai_twin);
  }
  if (role === 'broker') {
    if (profile.firm !== undefined) out.firm = text(profile.firm, 'Firm name', { max: 160 });
    if (profile.rera_agent_no !== undefined) out.rera_agent_no = text(profile.rera_agent_no, 'RERA agent number', { max: 100 });
    if (profile.commission !== undefined) out.commission = validateRate(profile.commission, 'Commission');
  }
  if (role === 'maintenance' && profile.skills !== undefined) {
    if (!Array.isArray(profile.skills) || profile.skills.length > 30) throw fail(400, 'Skills must be a list of at most 30 items');
    out.skills = profile.skills.map((skill, i) => text(skill, `Skill ${i + 1}`, { optional: false, max: 80 }));
  }
  return out;
}

function validateRate(value, label) {
  record(value, label);
  if (Object.keys(value).some(k => !['type', 'value'].includes(k))) throw fail(400, `Unsupported ${label.toLowerCase()} field`);
  return {
    type: oneOf(value.type, `${label} type`, ['percent', 'flat'], { optional: false }),
    value: number(value.value, `${label} value`, { min: 0, max: value.type === 'flat' ? 1_000_000_000 : 100, optional: false })
  };
}

// ---------- Org settings (admin) ----------
r.put('/org', allow('admin'), h(async (req, res) => {
  const { name, phone, email, address, rera_promoter, logo_url, settings } = req.body || {};
  const allowed = ['name', 'phone', 'email', 'address', 'rera_promoter', 'logo_url', 'settings'];
  if (Object.keys(req.body || {}).some(k => !allowed.includes(k))) throw fail(400, 'Unsupported organization field');
  const cleanName = name === undefined ? null : text(name, 'Company name', { optional: false, max: 160 });
  const cleanPhone = phone === undefined ? null : (validPhone(phone, 'Office phone') || null);
  const cleanEmail = email === undefined ? null : validEmail(email, 'Office email', { optional: false });
  const cleanAddress = address === undefined ? null : text(address, 'Address', { max: 1000 });
  const cleanRera = rera_promoter === undefined ? null : text(rera_promoter, 'Promoter RERA number', { max: 100 });
  const cleanLogo = logo_url === undefined ? null : text(logo_url, 'Logo URL', { max: 2048 });
  if (cleanLogo) { let url; try { url = new URL(cleanLogo); } catch { throw fail(400, 'Logo URL must be a valid HTTP or HTTPS URL'); } if (!['http:', 'https:'].includes(url.protocol)) throw fail(400, 'Logo URL must be a valid HTTP or HTTPS URL'); }
  const cleanSettings = settings === undefined ? undefined : validateSettings(settings);
  const cur = await one(`SELECT settings FROM orgs WHERE id = $1`, [req.user.org]);
  const o = await one(`UPDATE orgs SET name = COALESCE($2,name), phone = COALESCE($3,phone), email = COALESCE($4,email), address = COALESCE($5,address),
                         rera_promoter = COALESCE($6,rera_promoter), logo_url = COALESCE($7,logo_url), settings = $8 WHERE id = $1
                       RETURNING id, name, logo_url, phone, email, address, rera_promoter, settings`,
    [req.user.org, cleanName, cleanPhone, cleanEmail, cleanAddress, cleanRera, cleanLogo, merge(cur.settings, cleanSettings || {})]);
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
  const phoneNumberId = text(phone_number_id, 'WhatsApp phone number ID', { optional: false, max: 160 });
  const accessToken = text(access_token, 'WhatsApp access token', { optional: false, max: 4096 });
  const cleanDisplay = display === undefined || display === null || display === '' ? null : text(display, 'WhatsApp display name', { max: 160 });
  const cleanWaba = waba_id === undefined || waba_id === null || waba_id === '' ? null : text(waba_id, 'WhatsApp Business account ID', { max: 160 });
  if (user_id) {
    uuid(user_id, 'Team member ID');
    await assertOrgUser(user_id, req.user.org, ['sales']);
  }
  const row = await one(`INSERT INTO wa_numbers (org_id, user_id, phone_number_id, waba_id, display, access_token) VALUES ($1,$2,$3,$4,$5,$6)
                         ON CONFLICT (phone_number_id) DO UPDATE SET user_id = EXCLUDED.user_id, display = EXCLUDED.display, access_token = EXCLUDED.access_token
                         RETURNING id, display, phone_number_id, user_id`, [req.user.org, user_id || null, phoneNumberId, cleanWaba, cleanDisplay, accessToken]);
  res.json(row);
}));
r.delete('/integrations/whatsapp/:id', allow('admin'), h(async (req, res) => {
  uuid(req.params.id, 'WhatsApp number ID');
  await q(`DELETE FROM wa_numbers WHERE id = $1 AND org_id = $2`, [req.params.id, req.user.org]); res.sendStatus(204);
}));
r.post('/integrations/rotate-secret', allow('admin'), h(async (req, res) => {
  await q(`UPDATE orgs SET bridge_secret = encode(gen_random_bytes(18), 'hex') WHERE id = $1`, [req.user.org]); res.sendStatus(204);
}));

export default r;
