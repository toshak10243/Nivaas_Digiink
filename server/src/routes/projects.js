// Projects, towers, unit types, units (inventory), media, construction updates, uploads
import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { one, many, q, tx } from '../db.js';
import { h, allow, fail } from '../lib/auth.js';
import { costSheet } from '../lib/pricing.js';
import { config } from '../config.js';
import { settingsOf } from '../settings.js';
import { notify } from '../services/notify.js';

const r = Router();

// ---------- uploads ----------
const ALLOWED = /^(image\/(jpeg|png|webp|gif|heic)|video\/(mp4|quicktime|webm)|application\/pdf)$/;
export const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _f, cb) => { const d = path.join(config.uploadDir, req.user.org); fs.mkdirSync(d, { recursive: true }); cb(null, d); },
    filename: (_req, f, cb) => cb(null, crypto.randomUUID() + path.extname(f.originalname).toLowerCase()),
  }),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024 },
  fileFilter: (_req, f, cb) => cb(ALLOWED.test(f.mimetype) ? null : Object.assign(new Error('Only photos, videos and PDFs are allowed'), { status: 400 }), ALLOWED.test(f.mimetype)),
});
export const fileUrl = (req, f) => `/uploads/${req.user.org}/${f.filename}`;

r.post('/uploads', upload.array('files', 12), h(async (req, res) => {
  res.json((req.files || []).map(f => ({ url: fileUrl(req, f), name: f.originalname, type: f.mimetype, size: f.size })));
}));

// ---------- projects ----------
const projectFull = async (id, org) => {
  const p = await one(`SELECT * FROM projects WHERE id = $1 AND org_id = $2`, [id, org]);
  if (!p) throw fail(404, 'Project not found');
  p.towers = await many(`SELECT * FROM towers WHERE project_id = $1 ORDER BY name`, [id]);
  p.unit_types = await many(`SELECT * FROM unit_types WHERE project_id = $1 ORDER BY bhk, super_sqft`, [id]);
  p.media = await many(`SELECT * FROM media WHERE project_id = $1 ORDER BY sort, created_at`, [id]);
  p.updates = await many(`SELECT pu.*, t.name AS tower_name FROM project_updates pu LEFT JOIN towers t ON t.id::text = pu.tower_id::text WHERE pu.project_id = $1 ORDER BY pu.created_at DESC LIMIT 30`, [id]);
  p.stats = await one(`SELECT count(*)::int AS total, count(*) FILTER (WHERE status = 'available')::int AS available, count(*) FILTER (WHERE status = 'hold')::int AS hold,
                         count(*) FILTER (WHERE status IN ('booked','sold'))::int AS sold FROM units WHERE project_id = $1`, [id]);
  return p;
};

r.get('/projects', h(async (req, res) => {
  const rows = await many(
    `SELECT p.*, (SELECT count(*)::int FROM units u WHERE u.project_id = p.id) AS total,
            (SELECT count(*)::int FROM units u WHERE u.project_id = p.id AND u.status = 'available') AS available,
            (SELECT count(*)::int FROM units u WHERE u.project_id = p.id AND u.status IN ('booked','sold')) AS sold,
            (SELECT min(t.super_sqft * p.rate_sqft) FROM unit_types t WHERE t.project_id = p.id) AS from_price,
            (SELECT string_agg(DISTINCT t.bhk::text, ', ' ORDER BY t.bhk::text) FROM unit_types t WHERE t.project_id = p.id) AS bhks
     FROM projects p WHERE p.org_id = $1 ORDER BY p.created_at`, [req.user.org]);
  res.json(rows);
}));
r.get('/projects/:id', h(async (req, res) => res.json(await projectFull(req.params.id, req.user.org))));

const PCOLS = ['name', 'tagline', 'description', 'location', 'city', 'map_url', 'rera_no', 'status', 'possession', 'rate_sqft', 'charges', 'payment_plan', 'amenities', 'highlights', 'cover_url', 'brochure_url', 'sales_pool'];

r.post('/projects', allow('admin'), h(async (req, res) => {
  const b = req.body || {};
  if (!b.name) throw fail(400, 'Project name is required');
  const p = await one(`INSERT INTO projects (org_id, name, city, rate_sqft, charges, payment_plan) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [req.user.org, b.name, b.city || null, b.rate_sqft || 0, b.charges || { parking: 300000, club: 150000, maintenance_deposit: 75000, gst_pct: 5, stamp_pct: 6, registration: 30000 },
      JSON.stringify(b.payment_plan || [{ milestone: 'On booking', pct: 10 }, { milestone: 'Within 30 days (agreement)', pct: 15 }, { milestone: 'On slab completion', pct: 45 }, { milestone: 'On possession', pct: 30 }])]);
  res.json(await projectFull(p.id, req.user.org));
}));

r.put('/projects/:id', allow('admin'), h(async (req, res) => {
  const b = req.body || {};
  const sets = [], vals = [req.params.id, req.user.org];
  for (const c of PCOLS) if (b[c] !== undefined) { vals.push(['charges', 'payment_plan'].includes(c) ? JSON.stringify(b[c]) : b[c]); sets.push(`${c} = $${vals.length}`); }
  if (sets.length) await q(`UPDATE projects SET ${sets.join(', ')} WHERE id = $1 AND org_id = $2`, vals);
  res.json(await projectFull(req.params.id, req.user.org));
}));

r.delete('/projects/:id', allow('admin'), h(async (req, res) => {
  const sold = await one(`SELECT 1 FROM bookings b JOIN units u ON u.id = b.unit_id WHERE u.project_id = $1 LIMIT 1`, [req.params.id]);
  if (sold) throw fail(409, 'This project has bookings and cannot be deleted');
  await q(`DELETE FROM projects WHERE id = $1 AND org_id = $2`, [req.params.id, req.user.org]); res.sendStatus(204);
}));

// unit types
r.post('/projects/:id/unit-types', allow('admin'), h(async (req, res) => {
  const t = req.body || {};
  const row = await one(`INSERT INTO unit_types (project_id, name, bhk, carpet_sqft, builtup_sqft, super_sqft, bathrooms, balconies, floorplan_url)
                         SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9 FROM projects WHERE id = $1 AND org_id = $10 RETURNING *`,
    [req.params.id, t.name, t.bhk, t.carpet_sqft, t.builtup_sqft, t.super_sqft, t.bathrooms || 2, t.balconies || 1, t.floorplan_url || null, req.user.org]);
  res.json(row);
}));
r.put('/unit-types/:id', allow('admin'), h(async (req, res) => {
  const t = req.body || {};
  res.json(await one(`UPDATE unit_types t SET name = COALESCE($2,name), bhk = COALESCE($3,bhk), carpet_sqft = COALESCE($4,carpet_sqft), builtup_sqft = COALESCE($5,builtup_sqft),
                        super_sqft = COALESCE($6,super_sqft), bathrooms = COALESCE($7,bathrooms), balconies = COALESCE($8,balconies), floorplan_url = COALESCE($9,floorplan_url)
                      FROM projects p WHERE t.id = $1 AND p.id = t.project_id AND p.org_id = $10 RETURNING t.*`,
    [req.params.id, t.name, t.bhk, t.carpet_sqft, t.builtup_sqft, t.super_sqft, t.bathrooms, t.balconies, t.floorplan_url, req.user.org]));
}));

/** Create a tower and all its units at once: floors × units per floor, each column mapped to a unit type. */
r.post('/projects/:id/towers', allow('admin'), h(async (req, res) => {
  const { name, floors, per_floor, types = [], facing = [], plc = [], start_floor = 1, format = '{floor}{n}-{tower}' } = req.body || {};
  if (!name || !floors || !per_floor) throw fail(400, 'Tower name, floors and units per floor are required');
  const p = await one(`SELECT id FROM projects WHERE id = $1 AND org_id = $2`, [req.params.id, req.user.org]);
  if (!p) throw fail(404, 'Project not found');
  const out = await tx(async t => {
    const tw = await t.one(`INSERT INTO towers (project_id, name, floors) VALUES ($1,$2,$3) RETURNING *`, [p.id, name, floors]);
    for (let f = start_floor; f < start_floor + floors; f++) for (let n = 1; n <= per_floor; n++) {
      const no = format.replace('{floor}', f).replace('{n}', String(n).padStart(2, '0')).replace('{tower}', name);
      await t.q(`INSERT INTO units (project_id, tower_id, unit_type_id, unit_no, floor, facing, plc_pct) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [p.id, tw.id, types[n - 1] || types[0] || null, no, f, facing[n - 1] || null, plc[n - 1] || 0]);
    }
    return tw;
  });
  res.json(out);
}));

// ---------- inventory ----------
r.get('/units', h(async (req, res) => {
  const { project_id, status } = req.query;
  const vals = [req.user.org]; let where = 'p.org_id = $1';
  if (project_id) { vals.push(project_id); where += ` AND u.project_id = $${vals.length}`; }
  if (status) { vals.push(status); where += ` AND u.status = $${vals.length}`; }
  const rows = await many(
    `SELECT u.*, t.name AS type_name, t.bhk, t.carpet_sqft, t.builtup_sqft, t.super_sqft, t.floorplan_url, tw.name AS tower,
            p.name AS project_name, p.rate_sqft, p.charges, hb.name AS hold_by_name,
            b.id AS booking_id, sb.name AS sold_by_name, br.name AS broker_name, b.booking_date, c.name AS customer_name
     FROM units u JOIN projects p ON p.id = u.project_id
     LEFT JOIN unit_types t ON t.id = u.unit_type_id LEFT JOIN towers tw ON tw.id = u.tower_id
     LEFT JOIN users hb ON hb.id = u.hold_by
     LEFT JOIN bookings b ON b.unit_id = u.id AND b.status <> 'cancelled'
     LEFT JOIN users sb ON sb.id = b.sold_by LEFT JOIN users br ON br.id = b.broker_id LEFT JOIN users c ON c.id = b.customer_id
     WHERE ${where} ORDER BY p.created_at, tw.name, u.floor DESC, u.unit_no`, vals);
  const hideBuyer = !['admin', 'sales'].includes(req.user.role);
  res.json(rows.map(u => {
    const cs = costSheet({ rate_sqft: u.rate_sqft, charges: u.charges }, u, u);
    const { charges, ...rest } = u;
    return { ...rest, price: cs.total, base_price: cs.base, customer_name: hideBuyer ? null : u.customer_name };
  }));
}));

/** status changes: hold / release / block / available. Booking & sale go through /bookings. */
r.patch('/units/:id', h(async (req, res) => {
  const u = await one(`SELECT u.*, p.org_id, p.name AS project FROM units u JOIN projects p ON p.id = u.project_id WHERE u.id = $1 AND p.org_id = $2`, [req.params.id, req.user.org]);
  if (!u) throw fail(404, 'Unit not found');
  const { action, plc_pct, price_override, facing, notes, unit_type_id } = req.body || {};
  const org = await one(`SELECT settings FROM orgs WHERE id = $1`, [req.user.org]);
  if (action === 'hold') {
    if (u.status !== 'available') throw fail(409, `${u.unit_no} is not available`);
    const hrs = settingsOf(org).holds.hours;
    await q(`UPDATE units SET status = 'hold', hold_by = $2, hold_until = now() + ($3 || ' hours')::interval, updated_at = now() WHERE id = $1`, [u.id, req.user.id, String(hrs)]);
    await notify(req.user.org, null, 'inventory', `${req.user.name} put ${u.unit_no} (${u.project}) on hold for ${hrs} h`, '/inventory');
  } else if (action === 'release') {
    if (u.status !== 'hold') throw fail(409, 'Unit is not on hold');
    if (req.user.role !== 'admin' && u.hold_by !== req.user.id) throw fail(403, 'Only the person who held it (or an admin) can release it');
    await q(`UPDATE units SET status = 'available', hold_by = NULL, hold_until = NULL, updated_at = now() WHERE id = $1`, [u.id]);
  } else if (action === 'block' || action === 'unblock') {
    if (req.user.role !== 'admin') throw fail(403, 'Admins only');
    if (action === 'block' && !['available', 'hold'].includes(u.status)) throw fail(409, 'Only available units can be blocked');
    await q(`UPDATE units SET status = $2, hold_by = NULL, hold_until = NULL, updated_at = now() WHERE id = $1`, [u.id, action === 'block' ? 'blocked' : 'available']);
  } else if (req.user.role === 'admin') {
    await q(`UPDATE units SET plc_pct = COALESCE($2, plc_pct), price_override = $3, facing = COALESCE($4, facing), notes = COALESCE($5, notes),
               unit_type_id = COALESCE($6, unit_type_id), updated_at = now() WHERE id = $1`,
      [u.id, plc_pct ?? null, price_override === '' ? null : price_override ?? u.price_override, facing ?? null, notes ?? null, unit_type_id ?? null]);
  } else throw fail(403, 'Admins only');
  res.json(await one(`SELECT * FROM units WHERE id = $1`, [u.id]));
}));

// ---------- media ----------
r.post('/projects/:id/media', allow('admin'), upload.array('files', 20), h(async (req, res) => {
  const p = await one(`SELECT id FROM projects WHERE id = $1 AND org_id = $2`, [req.params.id, req.user.org]);
  if (!p) throw fail(404, 'Project not found');
  const out = [];
  for (const f of req.files || []) {
    const kind = f.mimetype.startsWith('video') ? 'video' : f.mimetype === 'application/pdf' ? 'brochure' : (req.body.kind === 'floorplan' ? 'floorplan' : 'image');
    out.push(await one(`INSERT INTO media (org_id, project_id, unit_type_id, kind, url, title) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.org, p.id, req.body.unit_type_id || null, kind, fileUrl(req, f), req.body.title || f.originalname.replace(/\.[^.]+$/, '')]));
  }
  if (req.body.youtube) out.push(await one(`INSERT INTO media (org_id, project_id, kind, url, title) VALUES ($1,$2,'youtube',$3,$4) RETURNING *`, [req.user.org, p.id, req.body.youtube, req.body.title || 'Video']));
  res.json(out);
}));
r.patch('/media/:id', allow('admin'), h(async (req, res) => {
  res.json(await one(`UPDATE media SET title = COALESCE($3,title), sort = COALESCE($4,sort) WHERE id = $1 AND org_id = $2 RETURNING *`, [req.params.id, req.user.org, req.body.title, req.body.sort]));
}));
r.delete('/media/:id', allow('admin'), h(async (req, res) => {
  await q(`DELETE FROM media WHERE id = $1 AND org_id = $2`, [req.params.id, req.user.org]); res.sendStatus(204);
}));

// ---------- construction updates (shown to customers) ----------
r.post('/projects/:id/updates', allow('admin', 'sales'), h(async (req, res) => {
  const { title, body, media_url, tower_id, stage_name, progress_pct, media_urls } = req.body || {};
  if (!title) throw fail(400, 'Title is required');
  const urls = Array.isArray(media_urls) && media_urls.length > 0 ? media_urls : (media_url ? [media_url] : []);
  const u = await one(`INSERT INTO project_updates (project_id, title, body, media_url, tower_id, stage_name, progress_pct, media_urls)
    SELECT $1, $2, $3, $4, $5, $6, $7, $8
    FROM projects WHERE id = $1 AND org_id = $9 RETURNING *`,
    [req.params.id, title, body || null, urls[0] || null, tower_id || null, stage_name || null, progress_pct ? Number(progress_pct) : 0, JSON.stringify(urls), req.user.org]);
  const buyers = await many(`SELECT DISTINCT b.customer_id FROM bookings b JOIN units un ON un.id = b.unit_id WHERE un.project_id = $1 AND b.customer_id IS NOT NULL`, [req.params.id]);
  for (const b of buyers) await notify(req.user.org, b.customer_id, 'update', `Construction update: ${title}`, '/portal');
  res.json(u);
}));

r.delete('/projects/:projectId/updates/:updateId', allow('admin'), h(async (req, res) => {
  await q(`DELETE FROM project_updates WHERE id = $1 AND project_id IN (SELECT id FROM projects WHERE id = $2 AND org_id = $3)`,
    [req.params.updateId, req.params.projectId, req.user.org]);
  res.json({ ok: true });
}));

export default r;
