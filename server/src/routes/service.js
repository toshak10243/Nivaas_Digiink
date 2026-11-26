// After-sales: customer portal + complaint tickets with photos and a 24-hour SLA
import { Router } from 'express';
import fs from 'node:fs/promises';
import { one, many, q, tx } from '../db.js';
import { h, allow, fail } from '../lib/auth.js';
import { settingsOf } from '../settings.js';
import { notify } from '../services/notify.js';
import { privateUpload, verifyUploadedFiles, privateFileKey } from './projects.js';
import { privateFileUrl, signPrivateUrl } from './private-files.js';
import { oneOf, number, text, uuid, futureDateTime } from '../lib/validate.js';

const r = Router();
export const CATEGORIES = ['seepage', 'plumbing', 'electrical', 'carpentry', 'paint', 'tiles', 'lift', 'parking', 'other'];

// ---------- customer portal & buyer handover room ----------
r.get('/portal', allow('customer', 'admin', 'sales'), h(async (req, res) => {
  let whereClause = `WHERE b.status <> 'cancelled'`;
  const vals = [];
  if (req.user.role === 'customer') {
    vals.push(req.user.id);
    whereClause += ` AND b.customer_id = $1`;
  } else if (req.user.role === 'sales') {
    vals.push(req.user.org, req.user.id);
    whereClause += ` AND b.org_id = $1 AND b.sold_by = $2`;
  } else {
    vals.push(req.user.org);
    whereClause += ` AND b.org_id = $1`;
  }
  const bookings = await many(
    `SELECT b.*,
       COALESCE(c.name, l.name, 'Valued Buyer') AS customer_name,
       COALESCE(c.phone, l.phone, '') AS customer_phone,
       u.unit_no, u.floor, u.facing, t.name AS type_name, t.carpet_sqft, t.builtup_sqft, t.super_sqft, t.floorplan_url,
       tw.name AS tower_name, p.id AS project_id, p.name AS project_name, p.location, p.possession, p.cover_url, p.brochure_url,
       s.name AS agent_name, s.phone AS agent_phone,
       (SELECT coalesce(sum(amount),0) FROM payments x WHERE x.booking_id = b.id) AS paid
     FROM bookings b
     JOIN units u ON u.id = b.unit_id
     LEFT JOIN towers tw ON tw.id::text = u.tower_id::text
     JOIN projects p ON p.id = u.project_id
     LEFT JOIN unit_types t ON t.id = u.unit_type_id
     LEFT JOIN users s ON s.id = b.sold_by
     LEFT JOIN users c ON c.id = b.customer_id
     LEFT JOIN leads l ON l.id = b.lead_id
     ${whereClause}
     ORDER BY b.created_at DESC`, vals);
  const org = await one(`SELECT settings FROM orgs WHERE id = $1`, [req.user.org]);
  const payment = settingsOf(org).payment;
  const paymentInstructions = payment.payment_details_verified ? {
    upi_id: payment.upi_id,
    account_name: payment.account_name,
    bank_name: payment.bank_name,
    account_number: payment.account_number,
    ifsc_code: payment.ifsc_code,
    instructions: payment.instructions,
  } : null;
  for (const b of bookings) {
    b.payment_instructions = paymentInstructions;
    b.payments = await many(`SELECT * FROM payments WHERE booking_id = $1 ORDER BY paid_on`, [b.id]);
    b.updates = await many(`SELECT pu.*, tw.name AS tower_name FROM project_updates pu LEFT JOIN towers tw ON tw.id::text = pu.tower_id::text WHERE pu.project_id = $1 ORDER BY pu.created_at DESC LIMIT 20`, [b.project_id]);
    b.visits = b.lead_id ? await many(`SELECT v.id, v.scheduled_at, v.status, v.visitors_count, v.transport, v.pickup_address,
      p.name AS project_name, p.location AS project_location, p.map_url, u.name AS agent_name, u.phone AS agent_phone
      FROM site_visits v LEFT JOIN projects p ON p.id = v.project_id LEFT JOIN users u ON u.id = v.agent_id
      WHERE v.org_id = $1 AND v.lead_id = $2 ORDER BY v.scheduled_at DESC LIMIT 20`, [req.user.org, b.lead_id]) : [];
    b.documents = (await many(`SELECT id, title, category, file_name, mime_type, size_bytes, created_at
      FROM booking_documents WHERE org_id = $1 AND booking_id = $2 ORDER BY created_at DESC`, [req.user.org, b.id]))
      .map(document => ({ ...document, url: signPrivateUrl('booking-documents', document.id, req.user.org, 3600) }));
  }
  res.json({ bookings });
}));

/** Buyers can confirm or reschedule only future visits linked to their own booked lead. */
r.patch('/portal/visits/:id', allow('customer'), h(async (req, res) => {
  uuid(req.params.id, 'Visit ID');
  const { action, scheduled_at, reason } = req.body || {};
  oneOf(action, 'Visit action', ['confirm', 'reschedule'], { optional: false });
  const newTime = action === 'reschedule' ? futureDateTime(scheduled_at, 'New visit date and time') : null;
  const note = reason == null || reason === '' ? null : text(reason, 'Reschedule reason', { max: 500 });
  const updated = await tx(async t => {
    const visit = await t.one(`SELECT v.id, v.org_id, v.lead_id, v.agent_id, v.status, v.scheduled_at
      FROM site_visits v WHERE v.id = $1 AND v.org_id = $2 AND v.status IN ('scheduled','confirmed')
        AND v.scheduled_at > now()
        AND EXISTS (SELECT 1 FROM bookings b WHERE b.customer_id = $3 AND b.lead_id = v.lead_id AND b.org_id = v.org_id AND b.status <> 'cancelled')
      FOR UPDATE`, [req.params.id, req.user.org, req.user.id]);
    if (!visit) return null;
    if (action === 'confirm' && visit.status === 'confirmed') return { ...visit, unchanged: true };
    const changed = await t.one(`UPDATE site_visits SET status = $3,
        scheduled_at = COALESCE($4::timestamptz, scheduled_at),
        feedback = CASE WHEN $5::text IS NULL THEN feedback ELSE $5 END
      WHERE id = $1 AND org_id = $2 AND status IN ('scheduled','confirmed') AND scheduled_at > now()
      RETURNING id, status, scheduled_at, lead_id, agent_id`,
    [visit.id, req.user.org, action === 'confirm' ? 'confirmed' : 'scheduled', newTime, action === 'reschedule' ? (note ? `Buyer requested reschedule: ${note}` : 'Buyer requested reschedule') : null]);
    if (!changed) return null;
    return changed;
  });
  if (!updated) throw fail(404, 'Upcoming visit not found or has already changed');
  if (updated.unchanged) return res.json({ id: updated.id, status: updated.status, scheduled_at: updated.scheduled_at });
  const body = action === 'confirm' ? 'Buyer confirmed the site visit' : `Buyer rescheduled the site visit to ${new Date(updated.scheduled_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}${note ? `: ${note}` : ''}`;
  await q(`INSERT INTO lead_events (lead_id, actor_id, kind, body) VALUES ($1,$2,'visit',$3)`, [updated.lead_id, req.user.id, body]);
  if (updated.agent_id) await notify(req.user.org, updated.agent_id, 'visit', body, '/visits');
  res.json(updated);
}));

/** Admins attach verified buyer-facing documents to a booking; files stay private. */
r.post('/bookings/:id/documents', allow('admin'), privateUpload.array('files', 10), verifyUploadedFiles, h(async (req, res) => {
  const files = req.files || [];
  if (!files.length) throw fail(400, 'Choose at least one document');
  try {
    uuid(req.params.id, 'Booking ID');
    if (files.some(file => file.mimetype !== 'application/pdf' && !file.mimetype.startsWith('image/'))) throw fail(400, 'Buyer documents must be PDFs or images');
    const category = oneOf(req.body?.category || 'other', 'Document category', ['allotment', 'agreement', 'payment', 'noc', 'identity', 'registry', 'other'], { optional: false });
    const title = req.body?.title ? text(req.body.title, 'Document title', { optional: false, max: 160 }) : null;
    const booking = await one(`SELECT id FROM bookings WHERE id = $1 AND org_id = $2 AND status <> 'cancelled'`, [req.params.id, req.user.org]);
    if (!booking) throw fail(404, 'Booking not found');
    const documents = await tx(async t => {
      const rows = [];
      for (const [index, file] of files.entries()) {
        const sourceName = String(file.originalname || '').split(/[\\/]/).pop().slice(0, 160);
        const docTitle = title ? (files.length > 1 ? `${title} ${index + 1}` : title) : (sourceName || `Buyer document ${index + 1}`);
        const document = await t.one(`INSERT INTO booking_documents (org_id, booking_id, title, category, file_name, mime_type, size_bytes, storage_key, uploaded_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, title, category, file_name, mime_type, size_bytes, created_at`,
        [req.user.org, booking.id, docTitle, category, sourceName || docTitle, file.mimetype, file.size, privateFileKey(req, file), req.user.id]);
        rows.push({ ...document, url: signPrivateUrl('booking-documents', document.id, req.user.org, 3600) });
      }
      return rows;
    });
    res.status(201).json(documents);
  } catch (error) {
    await Promise.all(files.map(file => fs.unlink(file.path).catch(() => {})));
    throw error;
  }
}));

// ---------- tickets ----------
function ticketScope(user) {
  if (user.role === 'admin') return { sql: '', vals: [] };
  if (user.role === 'customer') return { sql: ' AND t.customer_id = $3', vals: [user.id] };
  if (user.role === 'maintenance') return { sql: '', vals: [] }; // whole queue
  if (user.role === 'sales') return { sql: ' AND b.sold_by = $3', vals: [user.id] };
  throw fail(403, 'No access');
}

r.get('/tickets', h(async (req, res) => {
  const s = ticketScope(req.user);
  const vals = [req.user.org, req.user.role, ...s.vals];
  let extra = '';
  if (req.query.status) { oneOf(req.query.status, 'Ticket status filter', ['open', 'in_progress', 'resolved', 'closed'], { optional: false }); vals.push(req.query.status); extra += ` AND t.status = $${vals.length}`; }
  const rows = await many(
    `SELECT t.*, u.unit_no, p.name AS project_name, c.name AS customer_name, c.phone AS customer_phone, m.name AS assigned_name, m.phone AS assigned_phone,
       (SELECT f.id FROM ticket_files f LEFT JOIN ticket_comments tc ON tc.id = f.comment_id WHERE f.ticket_id = t.id AND ($2 <> 'customer' OR f.comment_id IS NULL OR tc.internal = false) ORDER BY f.created_at LIMIT 1) AS thumb_id,
       (SELECT count(*)::int FROM ticket_comments x WHERE x.ticket_id = t.id AND ($2 <> 'customer' OR x.internal = false)) AS comments,
       (SELECT x.body FROM ticket_comments x WHERE x.ticket_id = t.id AND ($2 <> 'customer' OR x.internal = false) ORDER BY x.created_at DESC LIMIT 1) AS last_update,
       (SELECT x.created_at FROM ticket_comments x WHERE x.ticket_id = t.id AND ($2 <> 'customer' OR x.internal = false) ORDER BY x.created_at DESC LIMIT 1) AS last_update_at
     FROM tickets t LEFT JOIN units u ON u.id = t.unit_id LEFT JOIN projects p ON p.id = u.project_id LEFT JOIN users c ON c.id = t.customer_id
     LEFT JOIN users m ON m.id = t.assigned_to LEFT JOIN bookings b ON b.id = t.booking_id
     WHERE t.org_id = $1${s.sql}${extra} ORDER BY (t.status IN ('resolved','closed')), t.sla_due_at LIMIT 300`, vals);
  res.json(rows.map(({ thumb_id, ...row }) => ({ ...row, thumb: thumb_id ? privateFileUrl('tickets', thumb_id, req.user) : null })));
}));

r.get('/tickets/:id', h(async (req, res) => {
  uuid(req.params.id, 'Ticket ID');
  const t = await one(`SELECT t.*, u.unit_no, p.name AS project_name, c.name AS customer_name, c.phone AS customer_phone, m.name AS assigned_name, m.phone AS assigned_phone, b.sold_by
                       FROM tickets t LEFT JOIN units u ON u.id = t.unit_id LEFT JOIN projects p ON p.id = u.project_id LEFT JOIN users c ON c.id = t.customer_id
                       LEFT JOIN users m ON m.id = t.assigned_to LEFT JOIN bookings b ON b.id = t.booking_id
                       WHERE t.id = $1 AND t.org_id = $2`, [req.params.id, req.user.org]);
  const { role, id } = req.user;
  const ok = t && (role === 'admin' || role === 'maintenance' || (role === 'customer' && t.customer_id === id) || (role === 'sales' && t.sold_by === id));
  if (!ok) throw fail(404, 'Ticket not found');
  const files = await many(`SELECT f.id FROM ticket_files f LEFT JOIN ticket_comments c ON c.id = f.comment_id
    WHERE f.ticket_id = $1 AND ($2 <> 'customer' OR f.comment_id IS NULL OR c.internal = false) ORDER BY f.created_at`, [t.id, req.user.role]);
  t.files = files.map(f => ({ id: f.id, url: privateFileUrl('tickets', f.id, req.user) }));
  t.comments = await many(`SELECT x.*, u.name, u.role FROM ticket_comments x LEFT JOIN users u ON u.id = x.author_id WHERE x.ticket_id = $1 ${req.user.role === 'customer' ? 'AND NOT x.internal' : ''} ORDER BY x.created_at`, [t.id]);
  const lastVisible = t.comments[t.comments.length - 1];
  t.last_update = lastVisible?.body || null;
  t.last_update_at = lastVisible?.created_at || t.created_at;
  res.json(t);
}));

/** Customer raises a complaint (with photos). Goes to the least-busy maintenance person + the sales agent + admins. */
r.post('/tickets', allow('customer', 'admin', 'sales'), privateUpload.array('photos', 6), verifyUploadedFiles, h(async (req, res) => {
  const { booking_id, category, title, description, priority = 'normal' } = req.body || {};
  uuid(booking_id, 'Booking ID');
  const cleanTitle = text(title, 'Ticket title', { optional: false, max: 160 });
  const cleanDescription = description === undefined || description === null || description === '' ? null : text(description, 'Description', { max: 5000 });
  oneOf(category, 'Ticket category', CATEGORIES, { optional: false });
  oneOf(priority, 'Ticket priority', ['low', 'normal', 'urgent'], { optional: false });
  const b = await one(`SELECT b.*, u.unit_no FROM bookings b JOIN units u ON u.id = b.unit_id WHERE b.id = $1 AND b.org_id = $2 ${req.user.role === 'customer' ? 'AND b.customer_id = $3' : ''}`,
    req.user.role === 'customer' ? [booking_id, req.user.org, req.user.id] : [booking_id, req.user.org]);
  if (!b) throw fail(404, 'Booking not found');
  if (req.user.role === 'sales' && b.sold_by !== req.user.id) throw fail(404, 'Booking not found');
  const org = await one(`SELECT settings FROM orgs WHERE id = $1`, [req.user.org]);
  const sla = settingsOf(org).tickets;
  const hours = priority === 'urgent' ? sla.urgent_sla_hours : sla.sla_hours;
  const tech = await one(`SELECT u.id, u.name FROM users u WHERE u.org_id = $1 AND u.role = 'maintenance' AND u.active
                          ORDER BY (SELECT count(*) FROM tickets t WHERE t.assigned_to = u.id AND t.status IN ('open','in_progress')), random() LIMIT 1`, [req.user.org]);
  const t = await one(`INSERT INTO tickets (org_id, booking_id, unit_id, customer_id, category, title, description, priority, assigned_to, sla_due_at)
                       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now() + ($10 || ' hours')::interval) RETURNING *`,
    [req.user.org, b.id, b.unit_id, b.customer_id, category, cleanTitle, cleanDescription, priority === 'urgent' ? 'urgent' : priority === 'low' ? 'low' : 'normal', tech?.id || null, String(hours)]);
  for (const f of req.files || []) await q(`INSERT INTO ticket_files (ticket_id, url) VALUES ($1,$2)`, [t.id, privateFileKey(req, f)]);
  const msg = `Ticket #${t.number} · ${b.unit_no}: ${title}`;
  if (tech) await notify(req.user.org, tech.id, 'ticket', `New complaint assigned to you. ${msg}`, `/tickets/${t.id}`);
  if (sla.notify_sales_agent && b.sold_by) await notify(req.user.org, b.sold_by, 'ticket', `Your customer raised a complaint. ${msg}`, `/tickets/${t.id}`);
  await notify(req.user.org, null, 'ticket', `New complaint. ${msg}`, `/tickets/${t.id}`);
  await q(`INSERT INTO ticket_comments (ticket_id, author_id, body) VALUES ($1,NULL,$2)`, [t.id, `Ticket received. ${tech ? tech.name + ' from our maintenance team will' : 'Our team will'} contact you within ${hours} hours.`]);
  if (b.customer_id) await notify(req.user.org, b.customer_id, 'ticket', `Complaint #${t.number} received. Expected response within ${hours} hours.`, `/tickets/${t.id}`);
  res.json(t);
}));

r.patch('/tickets/:id', allow('admin', 'maintenance', 'customer'), h(async (req, res) => {
  uuid(req.params.id, 'Ticket ID');
  const t = await one(`SELECT * FROM tickets WHERE id = $1 AND org_id = $2`, [req.params.id, req.user.org]);
  if (!t) throw fail(404, 'Ticket not found');
  const { status, assigned_to, rating, priority } = req.body || {};
  const keys = ['status', 'assigned_to', 'rating', 'priority'];
  if (Object.keys(req.body || {}).some(key => !keys.includes(key))) throw fail(400, 'Unsupported ticket field');
  if (req.user.role === 'customer') {
    if (t.customer_id !== req.user.id) throw fail(403, 'No access');
    if (rating !== undefined) {
      const score = number(rating, 'Rating', { min: 1, max: 5, integer: true, optional: false });
      await q(`UPDATE tickets SET rating = $2, status = 'closed' WHERE id = $1`, [t.id, score]);
      return res.sendStatus(204);
    }
    if (status === 'open' && ['resolved', 'closed'].includes(t.status)) { // re-open
      await q(`UPDATE tickets SET status = 'open', resolved_at = NULL, sla_due_at = now() + interval '24 hours', sla_alerted = false WHERE id = $1`, [t.id]);
      if (t.assigned_to) await notify(req.user.org, t.assigned_to, 'ticket', `Customer re-opened ticket #${t.number}`, `/tickets/${t.id}`);
      return res.sendStatus(204);
    }
    throw fail(400, 'Nothing to change');
  }
  if (status !== undefined) oneOf(status, 'Ticket status', ['open', 'in_progress', 'resolved', 'closed'], { optional: false });
  if (priority !== undefined) oneOf(priority, 'Ticket priority', ['low', 'normal', 'urgent'], { optional: false });
  if (assigned_to !== undefined && assigned_to !== null && assigned_to !== '') uuid(assigned_to, 'Assignee ID');
  if (assigned_to) {
    const assignee = await one(`SELECT id FROM users WHERE id = $1 AND org_id = $2 AND role = 'maintenance' AND active`, [assigned_to, req.user.org]);
    if (!assignee) throw fail(400, 'Assignee must be an active maintenance user in this organization');
  }
  const row = await one(`UPDATE tickets SET status = COALESCE($2,status), assigned_to = COALESCE($3,assigned_to), priority = COALESCE($4,priority),
                           resolved_at = CASE WHEN $2 IN ('resolved','closed') THEN COALESCE(resolved_at, now()) ELSE resolved_at END WHERE id = $1 RETURNING *`,
    [t.id, status || null, assigned_to || null, priority || null]);
  if (status && status !== t.status && t.customer_id) {
    const label = { in_progress: 'Our team is working on it', resolved: 'Marked resolved. Please confirm and rate us', closed: 'Closed' }[status];
    if (label) {
      await q(`INSERT INTO ticket_comments (ticket_id, author_id, body) VALUES ($1,$2,$3)`, [t.id, req.user.id, label]);
      await notify(req.user.org, t.customer_id, 'ticket', `Ticket #${t.number}: ${label}`, `/tickets/${t.id}`);
    }
  }
  if (assigned_to && assigned_to !== t.assigned_to) await notify(req.user.org, assigned_to, 'ticket', `Ticket #${t.number} assigned to you`, `/tickets/${t.id}`);
  res.json(row);
}));

r.post('/tickets/:id/comments', allow('admin', 'maintenance', 'customer', 'sales'), privateUpload.array('photos', 6), verifyUploadedFiles, h(async (req, res) => {
  uuid(req.params.id, 'Ticket ID');
  const t = await one(`SELECT t.*, b.sold_by FROM tickets t LEFT JOIN bookings b ON b.id = t.booking_id WHERE t.id = $1 AND t.org_id = $2`, [req.params.id, req.user.org]);
  if (!t || (req.user.role === 'customer' && t.customer_id !== req.user.id) || (req.user.role === 'sales' && t.sold_by !== req.user.id)) throw fail(404, 'Ticket not found');
  const rawBody = req.body?.body;
  const body = rawBody === undefined || rawBody === null || rawBody === '' ? '' : text(rawBody, 'Comment', { max: 5000 });
  if (!body && !(req.files || []).length) throw fail(400, 'Write a message or add a photo');
  const internalValue = req.body?.internal;
  if (internalValue !== undefined && ![true, false, 'true', 'false'].includes(internalValue)) throw fail(400, 'Internal must be true or false');
  const internal = req.user.role !== 'customer' && (internalValue === true || internalValue === 'true');
  const c = await one(`INSERT INTO ticket_comments (ticket_id, author_id, body, internal) VALUES ($1,$2,$3,$4) RETURNING *`, [t.id, req.user.id, body || '(photo)', internal]);
  for (const f of req.files || []) await q(`INSERT INTO ticket_files (ticket_id, comment_id, url) VALUES ($1,$2,$3)`, [t.id, c.id, privateFileKey(req, f)]);
  if (req.user.role === 'customer') { if (t.assigned_to) await notify(req.user.org, t.assigned_to, 'ticket', `Customer replied on #${t.number}`, `/tickets/${t.id}`); }
  else if (!internal && t.customer_id) await notify(req.user.org, t.customer_id, 'ticket', `Reply on your ticket #${t.number}`, `/tickets/${t.id}`);
  if (req.user.role !== 'customer' && t.status === 'open') await q(`UPDATE tickets SET status = 'in_progress' WHERE id = $1`, [t.id]);
  res.json(c);
}));

export default r;
