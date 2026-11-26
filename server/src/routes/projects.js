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
import { number, oneOf, text, uuid, record, unitAreas, projectCharges, date } from '../lib/validate.js';

const r = Router();

// ---------- uploads ----------
const ALLOWED = /^(image\/(jpeg|png|webp|gif|heic)|video\/(mp4|quicktime|webm)|application\/pdf)$/;
const MIME_EXT = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/heic': '.heic',
  'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm', 'application/pdf': '.pdf',
};
function matchesFileType(mime, b) {
  if (mime === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (mime === 'image/png') return b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === 'image/gif') return ['GIF87a', 'GIF89a'].includes(b.toString('ascii', 0, 6));
  if (mime === 'image/webp') return b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';
  if (mime === 'image/heic') return b.toString('ascii', 4, 8) === 'ftyp' && /^(heic|heix|hevc|hevx|mif1|msf1|avif|avis)$/.test(b.toString('ascii', 8, 12));
  if (mime === 'video/mp4') return b.toString('ascii', 4, 8) === 'ftyp' && /^(isom|iso[2-9]|mp4[12]|avc1|M4V )/.test(b.toString('ascii', 8, 12));
  if (mime === 'video/quicktime') return b.toString('ascii', 4, 8) === 'ftyp' && b.toString('ascii', 8, 12) === 'qt  ';
  if (mime === 'video/webm') return b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (mime === 'application/pdf') return b.toString('ascii', 0, 5) === '%PDF-';
  return false;
}

const diskStorage = multer.diskStorage({
  destination: (req, _f, cb) => { const d = path.join(config.uploadDir, req.user.org); fs.mkdirSync(d, { recursive: true }); cb(null, d); },
  filename: (_req, f, cb) => cb(null, crypto.randomUUID() + (MIME_EXT[f.mimetype] || '.bin')),
});
const privateDiskStorage = multer.diskStorage({
  destination: (req, _f, cb) => { const d = path.join(config.uploadDir, 'private', req.user.org); fs.mkdirSync(d, { recursive: true }); cb(null, d); },
  filename: (_req, f, cb) => cb(null, crypto.randomUUID() + (MIME_EXT[f.mimetype] || '.bin')),
});
export const upload = multer({
  storage: diskStorage,
  limits: { fileSize: config.maxUploadMb * 1024 * 1024 },
  fileFilter: (_req, f, cb) => cb(ALLOWED.test(f.mimetype) ? null : Object.assign(new Error('Only photos, videos and PDFs are allowed'), { status: 400 }), ALLOWED.test(f.mimetype)),
});
export const privateUpload = multer({
  storage: privateDiskStorage,
  limits: { fileSize: config.maxUploadMb * 1024 * 1024 },
  fileFilter: (_req, f, cb) => cb(ALLOWED.test(f.mimetype) ? null : Object.assign(new Error('Only photos, videos and PDFs are allowed'), { status: 400 }), ALLOWED.test(f.mimetype)),
});
export const avatarUpload = multer({
  storage: privateDiskStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, f, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'].includes(f.mimetype);
    cb(allowed ? null : Object.assign(new Error('Profile pictures must be JPG, PNG, or WebP images'), { status: 400 }), allowed);
  },
});

export async function verifyUploadedFiles(req, _res, next) {
  const files = req.files || [];
  try {
    for (const file of files) {
      const handle = await fs.promises.open(file.path, 'r');
      const header = Buffer.alloc(32);
      try {
        const { bytesRead } = await handle.read(header, 0, header.length, 0);
        if (!matchesFileType(file.mimetype, header.subarray(0, bytesRead))) throw Object.assign(new Error('Uploaded file content does not match its declared type'), { status: 400 });
      } finally { await handle.close(); }
    }
    next();
  } catch (err) {
    await Promise.all(files.map(file => fs.promises.unlink(file.path).catch(() => {})));
    next(err);
  }
}

export const fileUrl = (req, f) => `/uploads/${req.user.org}/${f.filename}`;
export const privateFileKey = (req, f) => `private/${req.user.org}/${f.filename}`;

function validateYoutubeUrl(value) {
  const raw = text(value, 'YouTube URL', { optional: false, max: 2048 });
  let url;
  try { url = new URL(raw); } catch { throw fail(400, 'Enter a valid YouTube URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || !['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be'].includes(url.hostname.toLowerCase())) throw fail(400, 'Enter a valid YouTube HTTPS URL');
  return url.toString();
}

function validateMediaUrl(value, label, { allowHttp = false } = {}) {
  const raw = text(value, label, { optional: false, max: 2048 });
  if (/^\/uploads\//i.test(raw)) {
    const parts = raw.slice(1).split('/');
    if (parts[1]?.toLowerCase() === 'private' || parts.some(part => !part || part === '.' || part === '..' || !/^[a-z0-9_.-]+$/i.test(part))) throw fail(400, `${label} must be a valid upload path or HTTPS URL`);
    return raw;
  }
  let url;
  try { url = new URL(raw); } catch { throw fail(400, `${label} must be a valid upload path or HTTPS URL`); }
  const protocols = allowHttp ? ['https:', 'http:'] : ['https:'];
  if (!protocols.includes(url.protocol) || !url.hostname || url.username || url.password) throw fail(400, `${label} must be a valid ${allowHttp ? 'HTTP or HTTPS' : 'HTTPS'} URL`);
  return url.toString();
}

r.post('/uploads', allow('admin'), upload.array('files', 12), verifyUploadedFiles, h(async (req, res) => {
  const files = req.files || [];
  if (!files.length) throw fail(400, 'Choose at least one file to upload');
  res.json(files.map(f => ({ url: fileUrl(req, f), name: f.originalname, type: f.mimetype, size: f.size })));
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

r.get('/projects', allow('admin', 'sales', 'broker'), h(async (req, res) => {
  const rows = await many(
    `SELECT p.*, (SELECT count(*)::int FROM units u WHERE u.project_id = p.id) AS total,
            (SELECT count(*)::int FROM units u WHERE u.project_id = p.id AND u.status = 'available') AS available,
            (SELECT count(*)::int FROM units u WHERE u.project_id = p.id AND u.status IN ('booked','sold')) AS sold,
            (SELECT min(t.super_sqft * p.rate_sqft) FROM unit_types t WHERE t.project_id = p.id) AS from_price,
            (SELECT string_agg(DISTINCT t.bhk::text, ', ' ORDER BY t.bhk::text) FROM unit_types t WHERE t.project_id = p.id) AS bhks
     FROM projects p WHERE p.org_id = $1 ORDER BY p.created_at`, [req.user.org]);
  res.json(rows);
}));
r.get('/projects/:id', allow('admin', 'sales', 'broker'), h(async (req, res) => { uuid(req.params.id, 'Project ID'); res.json(await projectFull(req.params.id, req.user.org)); }));

const PCOLS = ['name', 'tagline', 'description', 'location', 'city', 'map_url', 'rera_no', 'status', 'possession', 'rate_sqft', 'charges', 'payment_plan', 'amenities', 'highlights', 'cover_url', 'brochure_url', 'sales_pool'];
const PROJECT_STATUSES = ['pre_launch', 'under_construction', 'ready'];

function validatePaymentPlan(plan) {
  if (!Array.isArray(plan) || plan.length < 1 || plan.length > 30) throw fail(400, 'Payment plan must have 1 to 30 milestones');
  const normalized = plan.map((item, i) => {
    record(item, `Milestone ${i + 1}`);
    if (Object.keys(item).some(key => !['milestone', 'pct', 'due'].includes(key))) throw fail(400, `Milestone ${i + 1} contains an unsupported field`);
    const milestone = text(item.milestone, `Milestone ${i + 1}`, { optional: false, max: 100 });
    const due = item.due === undefined || item.due === null || item.due === '' ? undefined : text(item.due, `Milestone ${i + 1} due date`, { optional: false, max: 80 });
    return { milestone, pct: number(item.pct, `Milestone ${i + 1} percentage`, { min: 0.01, max: 100, optional: false }), ...(due ? { due } : {}) };
  });
  const total = normalized.reduce((sum, item) => sum + item.pct, 0);
  if (Math.abs(total - 100) > 0.01) throw fail(400, 'Payment plan percentages must total 100');
  return normalized;
}

r.post('/projects', allow('admin'), h(async (req, res) => {
  const b = req.body || {};
  if (Object.keys(b).some(key => !['name', 'city', 'rate_sqft', 'charges', 'payment_plan'].includes(key))) throw fail(400, 'Unsupported project field');
  const name = text(b.name, 'Project name', { optional: false, max: 120 });
  const city = b.city === undefined || b.city === null || b.city === '' ? null : text(b.city, 'City', { optional: false, max: 120 });
  const rate = number(b.rate_sqft ?? 0, 'Rate per square foot', { min: 0, max: 1_000_000, optional: false });
  const charges = projectCharges(b.charges === undefined ? { parking: 300000, club: 150000, maintenance_deposit: 75000, registry_pct: 7.5, stamp_pct: 6, registration: 30000 } : b.charges);
  const paymentPlan = validatePaymentPlan(b.payment_plan === undefined ? [{ milestone: 'On booking', pct: 10 }, { milestone: 'Within 30 days (agreement)', pct: 15 }, { milestone: 'On slab completion', pct: 45 }, { milestone: 'On possession', pct: 30 }] : b.payment_plan);
  const p = await one(`INSERT INTO projects (org_id, name, city, rate_sqft, charges, payment_plan) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [req.user.org, name, city, rate, charges, JSON.stringify(paymentPlan)]);
  res.json(await projectFull(p.id, req.user.org));
}));

r.put('/projects/:id', allow('admin'), h(async (req, res) => {
  uuid(req.params.id, 'Project ID');
  const b = req.body || {};
  if (Object.keys(b).some(key => !PCOLS.includes(key))) throw fail(400, 'Unsupported project field');
  if (b.name !== undefined) b.name = text(b.name, 'Project name', { optional: false, max: 120 });
  if (b.status !== undefined) oneOf(b.status, 'Project status', PROJECT_STATUSES, { optional: false });
  if (b.rate_sqft !== undefined) number(b.rate_sqft, 'Rate per square foot', { min: 0, max: 1_000_000, optional: false });
  for (const [key, max] of Object.entries({ tagline: 160, description: 5000, location: 240, city: 120, map_url: 2048, rera_no: 120, possession: 120, cover_url: 2048, brochure_url: 2048 })) {
    if (b[key] !== undefined) b[key] = b[key] === null ? null : text(b[key], key.replaceAll('_', ' '), { max });
  }
  for (const key of ['cover_url', 'brochure_url']) if (b[key] !== undefined && b[key] !== null) b[key] = b[key] === '' ? null : validateMediaUrl(b[key], key.replaceAll('_', ' '));
  if (b.map_url !== undefined && b.map_url !== null) b.map_url = b.map_url === '' ? null : validateMediaUrl(b.map_url, 'Map URL', { allowHttp: true });
  if (b.charges !== undefined) b.charges = projectCharges(b.charges);
  if (b.payment_plan !== undefined) b.payment_plan = validatePaymentPlan(b.payment_plan);
  for (const key of ['amenities', 'highlights']) if (b[key] !== undefined) {
    if (!Array.isArray(b[key]) || b[key].length > 50 || b[key].some(x => typeof x !== 'string' || !x.trim() || x.length > 160)) throw fail(400, `${key} must be a list of up to 50 text items (160 characters each)`);
  }
  if (b.sales_pool !== undefined) {
    if (!Array.isArray(b.sales_pool) || b.sales_pool.length > 200 || b.sales_pool.some(id => typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) throw fail(400, 'Sales pool must contain valid user IDs');
    const pool = [...new Set(b.sales_pool)];
    const users = pool.length ? await many(`SELECT id FROM users WHERE id = ANY($1::uuid[]) AND org_id = $2 AND role IN ('sales','broker') AND active`, [pool, req.user.org]) : [];
    if (users.length !== pool.length) throw fail(400, 'Sales pool users must be active sales agents or brokers in this organization');
  }
  const sets = [], vals = [req.params.id, req.user.org];
  for (const c of PCOLS) if (b[c] !== undefined) { vals.push(['charges', 'payment_plan'].includes(c) ? JSON.stringify(b[c]) : b[c]); sets.push(`${c} = $${vals.length}`); }
  if (sets.length) await q(`UPDATE projects SET ${sets.join(', ')} WHERE id = $1 AND org_id = $2`, vals);
  res.json(await projectFull(req.params.id, req.user.org));
}));

r.delete('/projects/:id', allow('admin'), h(async (req, res) => {
  uuid(req.params.id, 'Project ID');
  const sold = await one(`SELECT 1 FROM bookings b JOIN units u ON u.id = b.unit_id WHERE u.project_id = $1 LIMIT 1`, [req.params.id]);
  if (sold) throw fail(409, 'This project has bookings and cannot be deleted');
  await q(`DELETE FROM projects WHERE id = $1 AND org_id = $2`, [req.params.id, req.user.org]); res.sendStatus(204);
}));

// unit types
r.post('/projects/:id/unit-types', allow('admin'), h(async (req, res) => {
  uuid(req.params.id, 'Project ID');
  const t = req.body || {};
  const allowed = ['name', 'bhk', 'carpet_sqft', 'builtup_sqft', 'super_sqft', 'bathrooms', 'balconies', 'floorplan_url'];
  if (Object.keys(t).some(key => !allowed.includes(key))) throw fail(400, 'Unsupported unit type field');
  const typeName = text(t.name, 'Unit type name', { optional: false, max: 100 });
  const bhk = number(t.bhk, 'BHK count', { min: 1, max: 20, integer: true, optional: false });
  const areas = unitAreas(t);
  const bathrooms = number(t.bathrooms ?? 2, 'Bathrooms', { min: 0, max: 20, integer: true, optional: false });
  const balconies = number(t.balconies ?? 1, 'Balconies', { min: 0, max: 20, integer: true, optional: false });
  const floorplan = t.floorplan_url ? validateMediaUrl(t.floorplan_url, 'Floor plan URL') : null;
  const row = await one(`INSERT INTO unit_types (project_id, name, bhk, carpet_sqft, builtup_sqft, super_sqft, bathrooms, balconies, floorplan_url)
                         SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9 FROM projects WHERE id = $1 AND org_id = $10 RETURNING *`,
    [req.params.id, typeName, bhk, areas.carpet_sqft, areas.builtup_sqft, areas.super_sqft, bathrooms, balconies, floorplan, req.user.org]);
  if (!row) throw fail(404, 'Project not found');
  res.json(row);
}));
r.put('/unit-types/:id', allow('admin'), h(async (req, res) => {
  uuid(req.params.id, 'Unit type ID');
  const t = req.body || {};
  const allowed = ['name', 'bhk', 'carpet_sqft', 'builtup_sqft', 'super_sqft', 'bathrooms', 'balconies', 'floorplan_url'];
  if (Object.keys(t).some(key => !allowed.includes(key))) throw fail(400, 'Unsupported unit type field');
  const cur = await one(`SELECT t.carpet_sqft, t.builtup_sqft, t.super_sqft FROM unit_types t JOIN projects p ON p.id = t.project_id WHERE t.id = $1 AND p.org_id = $2`, [req.params.id, req.user.org]);
  if (!cur) throw fail(404, 'Unit type not found');
  if (t.name !== undefined) t.name = text(t.name, 'Unit type name', { optional: false, max: 100 });
  if (t.bhk !== undefined) t.bhk = number(t.bhk, 'BHK count', { min: 1, max: 20, integer: true, optional: false });
  if (['carpet_sqft', 'builtup_sqft', 'super_sqft'].some(key => t[key] !== undefined)) {
    const areas = unitAreas({ carpet_sqft: t.carpet_sqft ?? cur.carpet_sqft, builtup_sqft: t.builtup_sqft ?? cur.builtup_sqft, super_sqft: t.super_sqft ?? cur.super_sqft });
    for (const key of ['carpet_sqft', 'builtup_sqft', 'super_sqft']) if (t[key] !== undefined) t[key] = areas[key];
  }
  if (t.bathrooms !== undefined) t.bathrooms = number(t.bathrooms, 'Bathrooms', { min: 0, max: 20, integer: true, optional: false });
  if (t.balconies !== undefined) t.balconies = number(t.balconies, 'Balconies', { min: 0, max: 20, integer: true, optional: false });
  if (t.floorplan_url !== undefined && t.floorplan_url !== null) t.floorplan_url = validateMediaUrl(t.floorplan_url, 'Floor plan URL');
  res.json(await one(`UPDATE unit_types t SET name = COALESCE($2,name), bhk = COALESCE($3,bhk), carpet_sqft = COALESCE($4,carpet_sqft), builtup_sqft = COALESCE($5,builtup_sqft),
                        super_sqft = COALESCE($6,super_sqft), bathrooms = COALESCE($7,bathrooms), balconies = COALESCE($8,balconies), floorplan_url = COALESCE($9,floorplan_url)
                      FROM projects p WHERE t.id = $1 AND p.id = t.project_id AND p.org_id = $10 RETURNING t.*`,
    [req.params.id, t.name, t.bhk, t.carpet_sqft, t.builtup_sqft, t.super_sqft, t.bathrooms, t.balconies, t.floorplan_url, req.user.org]));
}));

/** Create a tower and all its units at once: floors × units per floor, each column mapped to a unit type. */
r.post('/projects/:id/towers', allow('admin'), h(async (req, res) => {
  uuid(req.params.id, 'Project ID');
  const body = req.body || {};
  const allowed = ['name', 'floors', 'per_floor', 'types', 'facing', 'plc', 'start_floor', 'format'];
  if (Object.keys(body).some(key => !allowed.includes(key))) throw fail(400, 'Unsupported tower field');
  const { name, floors, per_floor, types = [], facing = [], plc = [], start_floor = 1, format = '{floor}{n}-{tower}' } = body;
  if (typeof name !== 'string' || !name.trim() || name.length > 80) throw fail(400, 'Tower name must be 1 to 80 characters');
  const floorCount = number(floors, 'Floors', { min: 1, max: 100, integer: true, optional: false });
  const unitsPerFloor = number(per_floor, 'Units per floor', { min: 1, max: 40, integer: true, optional: false });
  const firstFloor = number(start_floor, 'Starting floor', { min: 0, max: 300, integer: true, optional: false });
  if (floorCount * unitsPerFloor > 2000) throw fail(400, 'A tower can generate at most 2,000 units per request');
  if (!Array.isArray(types) || !Array.isArray(facing) || !Array.isArray(plc)) throw fail(400, 'Tower type, facing, and PLC values must be arrays');
  if (types.length > unitsPerFloor || facing.length > unitsPerFloor || plc.length > unitsPerFloor) throw fail(400, 'Tower configuration arrays cannot exceed units per floor');
  if (typeof format !== 'string' || !format.trim() || format.length > 80 || !format.includes('{floor}') || !format.includes('{n}') || /\{(?!floor\}|n\}|tower\})[^{}]*\}/.test(format)) throw fail(400, 'Unit number format must include {floor} and {n}, and be at most 80 characters');
  if (types.some(id => id && (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)))) throw fail(400, 'Unit type IDs must be valid');
  if (facing.some(value => value && (typeof value !== 'string' || value.length > 80))) throw fail(400, 'Facing values must be text up to 80 characters');
  const plcValues = plc.map((value, i) => number(value, `PLC ${i + 1}`, { min: 0, max: 100, optional: false }));
  const p = await one(`SELECT id FROM projects WHERE id = $1 AND org_id = $2`, [req.params.id, req.user.org]);
  if (!p) throw fail(404, 'Project not found');
  const typeIds = [...new Set(types.filter(Boolean))];
  if (typeIds.length) {
    const valid = await many(`SELECT id FROM unit_types WHERE project_id = $1 AND id = ANY($2::uuid[])`, [p.id, typeIds]);
    if (valid.length !== typeIds.length) throw fail(400, 'All unit types must belong to this project');
  }
  const out = await tx(async t => {
    const tw = await t.one(`INSERT INTO towers (project_id, name, floors) VALUES ($1,$2,$3) RETURNING *`, [p.id, name.trim(), floorCount]);
    for (let f = firstFloor; f < firstFloor + floorCount; f++) for (let n = 1; n <= unitsPerFloor; n++) {
      const no = format.replace('{floor}', f).replace('{n}', String(n).padStart(2, '0')).replace('{tower}', name);
      await t.q(`INSERT INTO units (project_id, tower_id, unit_type_id, unit_no, floor, facing, plc_pct) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [p.id, tw.id, types[n - 1] || types[0] || null, no, f, facing[n - 1] || null, plcValues[n - 1] || 0]);
    }
    return tw;
  });
  res.json(out);
}));

// ---------- inventory ----------
r.get('/units', allow('admin', 'sales', 'broker'), h(async (req, res) => {
  const { project_id, status } = req.query;
  if (project_id) uuid(project_id, 'Project ID');
  if (status) oneOf(status, 'Inventory status', ['available', 'hold', 'booked', 'sold', 'blocked'], { optional: false });
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
  uuid(req.params.id, 'Unit ID');
  const u = await one(`SELECT u.*, p.org_id, p.name AS project FROM units u JOIN projects p ON p.id = u.project_id WHERE u.id = $1 AND p.org_id = $2`, [req.params.id, req.user.org]);
  if (!u) throw fail(404, 'Unit not found');
  const { action, plc_pct, price_override, facing, notes, unit_type_id } = req.body || {};
  if (Object.keys(req.body || {}).some(key => !['action', 'plc_pct', 'price_override', 'facing', 'notes', 'unit_type_id'].includes(key))) throw fail(400, 'Unsupported inventory field');
  if (unit_type_id !== undefined && unit_type_id !== null) uuid(unit_type_id, 'Unit type ID');
  if (action !== undefined) oneOf(action, 'Inventory action', ['hold', 'extend', 'release', 'block', 'unblock'], { optional: false });
  if (plc_pct !== undefined) number(plc_pct, 'PLC percentage', { min: 0, max: 100, optional: false });
  if (price_override !== undefined && price_override !== '') number(price_override, 'Price override', { min: 0, max: 1_000_000_000, optional: false });
  if (facing !== undefined && facing !== null && (typeof facing !== 'string' || facing.length > 80)) throw fail(400, 'Facing must be at most 80 characters');
  if (notes !== undefined && notes !== null && (typeof notes !== 'string' || notes.length > 1000)) throw fail(400, 'Unit notes must be at most 1,000 characters');
  const org = await one(`SELECT settings FROM orgs WHERE id = $1`, [req.user.org]);
  if (action === 'hold') {
    if (!['admin', 'sales', 'broker'].includes(req.user.role)) throw fail(403, 'Only sales staff can hold inventory');
    const hrs = settingsOf(org).holds.hours;
    const held = await one(`UPDATE units SET status = 'hold', hold_by = $2, hold_until = now() + ($3 || ' hours')::interval, updated_at = now()
                           WHERE id = $1 AND (status = 'available' OR (status = 'hold' AND (hold_until IS NULL OR hold_until <= now()))) RETURNING id`, [u.id, req.user.id, String(hrs)]);
    if (!held) throw fail(409, `${u.unit_no} is no longer available`);
    await notify(req.user.org, null, 'inventory', `${req.user.name} put ${u.unit_no} (${u.project}) on hold for ${hrs} h`, '/inventory');
  } else if (action === 'extend') {
    if (!['admin', 'sales', 'broker'].includes(req.user.role)) throw fail(403, 'Only sales staff can extend a hold');
    const hrs = settingsOf(org).holds.hours;
    const extended = await one(`UPDATE units SET hold_until = now() + ($4 || ' hours')::interval, updated_at = now()
                               WHERE id = $1 AND status = 'hold' AND hold_until > now()
                                 AND (hold_by = $3 OR $2 = 'admin') RETURNING id`, [u.id, req.user.role, req.user.id, String(hrs)]);
    if (!extended) throw fail(409, 'Only the active hold owner (or an admin) can extend this hold');
  } else if (action === 'release') {
    if (!['admin', 'sales', 'broker'].includes(req.user.role)) throw fail(403, 'Only sales staff can release inventory');
    const released = await one(`UPDATE units SET status = 'available', hold_by = NULL, hold_until = NULL, updated_at = now()
                                WHERE id = $1 AND status = 'hold' AND hold_until > now() AND ($2 = 'admin' OR hold_by = $3) RETURNING id`,
      [u.id, req.user.role, req.user.id]);
    if (!released) throw fail(409, 'Unit is not held by you or has already changed');
  } else if (action === 'block' || action === 'unblock') {
    if (req.user.role !== 'admin') throw fail(403, 'Admins only');
    if (action === 'block' && !['available', 'hold'].includes(u.status)) throw fail(409, 'Only available units can be blocked');
    await q(`UPDATE units SET status = $2, hold_by = NULL, hold_until = NULL, updated_at = now() WHERE id = $1`, [u.id, action === 'block' ? 'blocked' : 'available']);
  } else if (req.user.role === 'admin') {
    if (unit_type_id) {
      const type = await one(`SELECT 1 FROM unit_types WHERE id = $1 AND project_id = $2`, [unit_type_id, u.project_id]);
      if (!type) throw fail(400, 'Unit type must belong to this project');
    }
    await q(`UPDATE units SET plc_pct = COALESCE($2, plc_pct), price_override = $3, facing = COALESCE($4, facing), notes = COALESCE($5, notes),
               unit_type_id = COALESCE($6, unit_type_id), updated_at = now() WHERE id = $1`,
      [u.id, plc_pct ?? null, price_override === '' ? null : price_override ?? u.price_override, facing ?? null, notes ?? null, unit_type_id ?? null]);
  } else throw fail(403, 'Admins only');
  res.json(await one(`SELECT * FROM units WHERE id = $1`, [u.id]));
}));

// ---------- media ----------
r.post('/projects/:id/media', allow('admin'), upload.array('files', 20), verifyUploadedFiles, h(async (req, res) => {
  const files = req.files || [];
  let out;
  try {
    uuid(req.params.id, 'Project ID');
    const p = await one(`SELECT id FROM projects WHERE id = $1 AND org_id = $2`, [req.params.id, req.user.org]);
    if (!p) throw fail(404, 'Project not found');
    const kindRequested = req.body.kind || 'image';
    oneOf(kindRequested, 'Media type', ['image', 'video', 'floorplan', 'brochure'], { optional: false });
    const unitTypeId = req.body.unit_type_id || null;
    if (unitTypeId) uuid(unitTypeId, 'Flat type ID');
    if (unitTypeId && !(await one(`SELECT id FROM unit_types WHERE id = $1 AND project_id = $2`, [unitTypeId, p.id]))) throw fail(400, 'Selected flat type does not belong to this project');
    if (kindRequested === 'floorplan' && !unitTypeId) throw fail(400, 'Select a flat type for its floor plan');
    const youtube = req.body.youtube ? validateYoutubeUrl(req.body.youtube) : null;
    if (!files.length && !youtube) throw fail(400, 'Choose media files or provide a YouTube URL');
    const title = req.body.title ? text(req.body.title, 'Media title', { optional: false, max: 160 }) : null;
    const fileTitles = files.map(file => title || text(file.originalname.replace(/\.[^.]+$/, ''), 'Media title', { max: 160 }));
    for (const f of files) {
      const isVideo = f.mimetype.startsWith('video/');
      const isImage = f.mimetype.startsWith('image/');
      const isPdf = f.mimetype === 'application/pdf';
      if ((kindRequested === 'video' && !isVideo) || (['image', 'floorplan'].includes(kindRequested) && !isImage) || (kindRequested === 'brochure' && !isPdf)) throw fail(400, `Selected media type does not match ${f.originalname}`);
    }
    out = await tx(async t => {
      const mediaRows = [];
      for (const [i, f] of files.entries()) {
        const kind = kindRequested;
        const url = fileUrl(req, f);
        mediaRows.push(await t.one(`INSERT INTO media (org_id, project_id, unit_type_id, kind, url, title) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
          [req.user.org, p.id, unitTypeId, kind, url, fileTitles[i]]));
        if (kind === 'floorplan' && unitTypeId) await t.q(`UPDATE unit_types SET floorplan_url = $2 WHERE id = $1`, [unitTypeId, url]);
      }
      if (youtube) mediaRows.push(await t.one(`INSERT INTO media (org_id, project_id, unit_type_id, kind, url, title) VALUES ($1,$2,$3,'youtube',$4,$5) RETURNING *`, [req.user.org, p.id, unitTypeId, youtube, title || 'Video']));
      return mediaRows;
    });
  } catch (error) {
    await Promise.all(files.map(file => fs.promises.unlink(file.path).catch(() => {})));
    throw error;
  }
  res.json(out);
}));
r.patch('/media/:id', allow('admin'), h(async (req, res) => {
  uuid(req.params.id, 'Media ID');
  const { title, sort } = req.body || {};
  if (Object.keys(req.body || {}).some(key => !['title', 'sort'].includes(key))) throw fail(400, 'Unsupported media field');
  const cleanTitle = title === undefined ? null : text(title, 'Media title', { optional: false, max: 160 });
  const cleanSort = sort === undefined ? null : number(sort, 'Media order', { min: 0, max: 100_000, integer: true, optional: false });
  const row = await one(`UPDATE media SET title = COALESCE($3,title), sort = COALESCE($4,sort) WHERE id = $1 AND org_id = $2 RETURNING *`, [req.params.id, req.user.org, cleanTitle, cleanSort]);
  if (!row) throw fail(404, 'Media not found');
  res.json(row);
}));
r.delete('/media/:id', allow('admin'), h(async (req, res) => {
  uuid(req.params.id, 'Media ID');
  await q(`DELETE FROM media WHERE id = $1 AND org_id = $2`, [req.params.id, req.user.org]); res.sendStatus(204);
}));

// ---------- construction updates (shown to customers) ----------
r.post('/projects/:id/update-media', allow('admin', 'sales'), upload.array('files', 20), verifyUploadedFiles, h(async (req, res) => {
  const files = req.files || [];
  try {
    uuid(req.params.id, 'Project ID');
    const project = await one(`SELECT id FROM projects WHERE id = $1 AND org_id = $2`, [req.params.id, req.user.org]);
    if (!project) throw fail(404, 'Project not found');
    if (!files.length) throw fail(400, 'Choose at least one progress photo or video');
    if (files.some(file => !file.mimetype.startsWith('image/') && !file.mimetype.startsWith('video/'))) throw fail(400, 'Progress updates accept photos and videos only');
    res.json(files.map(file => ({ url: fileUrl(req, file), name: file.originalname, type: file.mimetype, size: file.size })));
  } catch (error) {
    await Promise.all(files.map(file => fs.promises.unlink(file.path).catch(() => {})));
    throw error;
  }
}));

r.post('/projects/:id/updates', allow('admin', 'sales'), h(async (req, res) => {
  const { title, body, media_url, tower_id, stage_name, progress_pct, media_urls, next_milestone, next_milestone_date } = req.body || {};
  uuid(req.params.id, 'Project ID');
  const cleanTitle = text(title, 'Update title', { optional: false, max: 160 });
  const cleanBody = body === undefined || body === null || body === '' ? null : text(body, 'Update details', { max: 5000 });
  const cleanStage = stage_name === undefined || stage_name === null || stage_name === '' ? null : text(stage_name, 'Construction stage', { max: 120 });
  const cleanNextMilestone = next_milestone === undefined || next_milestone === null || next_milestone === '' ? null : text(next_milestone, 'Next expected milestone', { max: 160 });
  const cleanNextDate = next_milestone_date === undefined || next_milestone_date === null || next_milestone_date === '' ? null : date(next_milestone_date, 'Next milestone date', { optional: false }).slice(0, 10);
  if (cleanNextDate && !cleanNextMilestone) throw fail(400, 'Enter the next expected milestone when providing its date');
  if (tower_id) uuid(tower_id, 'Tower ID');
  const progress = progress_pct === undefined || progress_pct === null || progress_pct === '' ? 0 : number(progress_pct, 'Progress percentage', { min: 0, max: 100, optional: false });
  let urls;
  if (media_urls !== undefined) {
    if (!Array.isArray(media_urls) || media_urls.length > 20) throw fail(400, 'Media URLs must be a list of at most 20 items');
    urls = media_urls.map((url, i) => validateMediaUrl(url, `Media URL ${i + 1}`));
  } else urls = media_url ? [validateMediaUrl(media_url, 'Media URL')] : [];
  if (tower_id && !(await one(`SELECT id FROM towers WHERE id = $1 AND project_id = $2`, [tower_id, req.params.id]))) throw fail(400, 'Tower must belong to this project');
  const u = await one(`INSERT INTO project_updates (project_id, title, body, media_url, tower_id, stage_name, progress_pct, media_urls, next_milestone, next_milestone_date)
    SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
    FROM projects WHERE id = $1 AND org_id = $11 RETURNING *`,
    [req.params.id, cleanTitle, cleanBody, urls[0] || null, tower_id || null, cleanStage, progress, JSON.stringify(urls), cleanNextMilestone, cleanNextDate, req.user.org]);
  if (!u) throw fail(404, 'Project not found');
  const buyers = await many(`SELECT DISTINCT b.customer_id FROM bookings b JOIN units un ON un.id = b.unit_id WHERE un.project_id = $1 AND b.customer_id IS NOT NULL`, [req.params.id]);
  for (const b of buyers) await notify(req.user.org, b.customer_id, 'update', `Construction update: ${title}`, '/portal');
  res.json(u);
}));

r.delete('/projects/:projectId/updates/:updateId', allow('admin'), h(async (req, res) => {
  uuid(req.params.projectId, 'Project ID');
  uuid(req.params.updateId, 'Update ID');
  await q(`DELETE FROM project_updates WHERE id = $1 AND project_id IN (SELECT id FROM projects WHERE id = $2 AND org_id = $3)`,
    [req.params.updateId, req.params.projectId, req.user.org]);
  res.json({ ok: true });
}));

export default r;
