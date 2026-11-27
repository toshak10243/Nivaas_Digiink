// Leads, site visits, share links, agent chats, bookings, payments, commissions, payroll
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { one, many, q, tx } from '../db.js';
import { h, allow, fail } from '../lib/auth.js';
import { costSheet, scheduleFor, inr } from '../lib/pricing.js';
import { notify, notifyAdminsOnce, logLead } from '../services/notify.js';
import { assignLead } from '../services/routing.js';
import { scheduleVisitOnce } from '../services/site-visits.js';
import { parseEmployeeVisitConfirmation, visitMessageDetails } from '../services/visit-workflow.js';
import * as meta from '../services/meta.js';
import { config } from '../config.js';
import { resolveObjection, generateHandoverBrief, generateVisitPassportData } from '../services/gemini.js';
import { email as validEmail, phone as validPhone, number, date as dateValue, futureDateTime, oneOf, text, uuid } from '../lib/validate.js';
import { protectCustomerFields, protectCustomerRows } from '../lib/privacy.js';
import { signPrivateUrl } from './private-files.js';
import { prioritizeLead } from '../../../shared/lead-priority.js';

const r = Router();
const STAGES = ['new', 'contacted', 'qualified', 'visit_scheduled', 'visit_done', 'negotiation', 'booked', 'lost'];
const TEMPERATURES = ['hot', 'warm', 'cold'];
const LEAD_SOURCES = ['manual', 'walk_in', 'whatsapp', 'share_link', 'leadsathi', 'broker', 'meta_lead_ads'];
const LEAD_CREATE_FIELDS = ['name', 'phone', 'email', 'project_id', 'source', 'budget', 'config_pref', 'purpose', 'timeline', 'notes', 'stage', 'temperature', 'assigned_to', 'followup_at', 'followup_type', 'followup_note', 'auto_assign', 'whatsapp_consent'];
const LEAD_PATCH_FIELDS = ['name', 'email', 'budget', 'config_pref', 'purpose', 'timeline', 'notes', 'stage', 'temperature', 'project_id', 'unit_id', 'lost_reason', 'followup_at', 'followup_type', 'followup_note', 'whatsapp_consent'];

/** sales see their own leads, brokers see leads they own or registered, admins see all */
function scope(user, alias = 'l', start = 2) {
  if (user.role === 'admin') return { sql: '', vals: [] };
  if (user.role === 'sales') return { sql: ` AND ${alias}.assigned_to = $${start}`, vals: [user.id] };
  if (user.role === 'broker') return { sql: ` AND (${alias}.assigned_to = $${start} OR ${alias}.broker_id = $${start})`, vals: [user.id] };
  throw fail(403, 'No access');
}
async function leadFor(user, id) {
  const s = scope(user, 'l', 3);
  const l = await one(`SELECT l.* FROM leads l WHERE l.id = $1 AND l.org_id = $2${s.sql}`, [id, user.org, ...s.vals]);
  if (!l) throw fail(404, 'Lead not found');
  return l;
}
async function notifyBuyerForLeadVisit(orgId, leadId, body) {
  const buyers = await many(`SELECT DISTINCT customer_id FROM bookings WHERE org_id = $1 AND lead_id = $2 AND status <> 'cancelled' AND customer_id IS NOT NULL`, [orgId, leadId]);
  for (const buyer of buyers) await notify(orgId, buyer.customer_id, 'visit', body, '/portal');
}
async function sendVisitWhatsAppWhenAllowed(orgId, leadId, body) {
  const chat = await one(`SELECT c.*, n.phone_number_id, n.access_token, l.phone, l.whatsapp_consent
    FROM chats c JOIN wa_numbers n ON n.id = c.wa_number_id JOIN leads l ON l.id = c.lead_id
    WHERE c.org_id = $1 AND c.lead_id = $2 AND l.whatsapp_consent <> 'opted_out'
      AND c.last_customer_at > now() - interval '24 hours' ORDER BY c.last_customer_at DESC LIMIT 1`, [orgId, leadId]);
  if (!chat) return false;
  try {
    const sent = await meta.sendText(chat, meta.normPhone(chat.phone), body);
    await one(`INSERT INTO chat_messages (chat_id,sender,body,ext_id,delivery_status,status_updated_at)
      VALUES ($1,'agent',$2,$3,'accepted',now()) RETURNING id`, [chat.id, body, sent?.messages?.[0]?.id || null]);
    await q(`UPDATE chats SET last_agent_at = now(), pending_ai_at = NULL WHERE id = $1`, [chat.id]);
    return true;
  } catch (error) {
    await one(`INSERT INTO chat_messages (chat_id,sender,body,delivery_status,delivery_error,status_updated_at)
      VALUES ($1,'agent',$2,'failed',$3,now()) RETURNING id`, [chat.id, body, String(error.message).slice(0, 1000)]);
    return false;
  }
}
async function visitDetailsFor(orgId, projectId, scheduledAt) {
  const project = projectId ? await one(`SELECT name, location, map_url FROM projects WHERE id = $1 AND org_id = $2`, [projectId, orgId]) : null;
  return visitMessageDetails({ when: scheduledAt, projectName: project?.name, address: project?.location, mapUrl: project?.map_url });
}
async function assertOrgUser(id, org, roles) {
  if (!id) return null;
  const u = await one(`SELECT id, role, active FROM users WHERE id = $1 AND org_id = $2`, [id, org]);
  if (!u || !u.active || (roles && !roles.includes(u.role))) throw fail(400, 'Selected user must be active and belong to this organization');
  return u;
}

// ---------- leads ----------
r.get('/leads', allow('admin', 'sales', 'broker'), h(async (req, res) => {
  const s = scope(req.user);
  const vals = [req.user.org, ...s.vals];
  let extra = '';
  for (const k of ['stage', 'project_id', 'assigned_to', 'source', 'temperature']) if (req.query[k]) { vals.push(req.query[k]); extra += ` AND l.${k} = $${vals.length}`; }
  if (req.query.q) { vals.push('%' + req.query.q + '%'); extra += ` AND (l.name ILIKE $${vals.length} OR l.phone ILIKE $${vals.length})`; }
  const rows = await many(
    `SELECT l.*, a.name AS assigned_name, a.role AS assigned_role, b.name AS broker_name, p.name AS project_name, u.unit_no,
       (SELECT count(*)::int FROM share_links sh WHERE sh.lead_id = l.id AND sh.last_viewed >= now() - interval '30 days') AS recent_share_views,
       (SELECT max(c.last_customer_at) FROM chats c WHERE c.lead_id = l.id) AS last_customer_message_at,
       (SELECT scheduled_at FROM site_visits v WHERE v.lead_id = l.id AND v.status IN ('scheduled','confirmed') ORDER BY scheduled_at LIMIT 1) AS next_visit
     FROM leads l LEFT JOIN users a ON a.id = l.assigned_to LEFT JOIN users b ON b.id = l.broker_id
     LEFT JOIN projects p ON p.id = l.project_id LEFT JOIN units u ON u.id = l.unit_id
     WHERE l.org_id = $1${s.sql}${extra} ORDER BY l.updated_at DESC LIMIT 500`, vals);
  const prioritized = rows.map(lead => ({ ...lead, ...prioritizeLead(lead) }))
    .sort((a, b) => b.priority_score - a.priority_score || new Date(b.updated_at) - new Date(a.updated_at));
  res.json(protectCustomerRows(prioritized, req.user.role));
}));

async function prepareLeadImport(rows, orgId) {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 250) throw fail(400, 'Upload between 1 and 250 lead rows at a time');
  const allowed = new Set(['name', 'phone', 'email', 'project', 'budget', 'config_pref', 'source', 'campaign']);
  const seen = new Set();
  const prepared = [];
  for (let index = 0; index < rows.length; index += 1) {
    const input = rows[index];
    const result = { row: index + 2, status: 'ready', name: '', phone: '', email: null, project_id: null, budget: null, config_pref: null, source: 'manual', campaign: null };
    try {
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !allowed.has(key))) throw fail(400, 'Unsupported or invalid row fields');
      result.name = text(input.name, 'Name', { optional: false, max: 160 });
      const rawPhone = validPhone(input.phone, 'Phone', { optional: false });
      result.phone = meta.normPhone(rawPhone);
      if (result.phone.length < 10 || result.phone.length > 15) throw fail(400, 'Enter a valid phone number');
      result.email = input.email ? validEmail(input.email, 'Email', { optional: false }) : null;
      result.source = input.source ? oneOf(input.source, 'Source', LEAD_SOURCES, { optional: false }) : 'manual';
      result.budget = input.budget ? text(input.budget, 'Budget', { max: 100 }) : null;
      result.config_pref = input.config_pref ? text(input.config_pref, 'Property preference', { max: 120 }) : null;
      result.campaign = input.campaign ? text(input.campaign, 'Campaign', { max: 200 }) : null;
      if (input.project) {
        const projectName = text(input.project, 'Project', { optional: false, max: 160 });
        const project = await one(`SELECT id FROM projects WHERE org_id=$1 AND lower(name)=lower($2)`, [orgId, projectName]);
        if (!project) throw fail(400, `Project not found: ${projectName}`);
        result.project_id = project.id;
      }
      if (seen.has(result.phone)) {
        result.status = 'duplicate'; result.reason = 'Phone repeats in this file';
      } else {
        seen.add(result.phone);
        const existing = await one(`SELECT id, name FROM leads WHERE org_id=$1 AND phone=$2 AND stage <> 'lost' ORDER BY created_at LIMIT 1`, [orgId, result.phone]);
        if (existing) { result.status = 'duplicate'; result.reason = `Already in CRM${existing.name ? ` as ${existing.name}` : ''}`; result.existing_lead_id = existing.id; }
      }
    } catch (error) { result.status = 'invalid'; result.reason = error.message || 'Invalid row'; }
    prepared.push(result);
  }
  return prepared;
}

r.post('/leads/import/preview', allow('admin'), h(async (req, res) => {
  const prepared = await prepareLeadImport(req.body?.rows, req.user.org);
  res.json({ rows: prepared, ready: prepared.filter(row => row.status === 'ready').length, duplicates: prepared.filter(row => row.status === 'duplicate').length, invalid: prepared.filter(row => row.status === 'invalid').length });
}));

r.post('/leads/import', allow('admin'), h(async (req, res) => {
  const prepared = await prepareLeadImport(req.body?.rows, req.user.org);
  const candidates = prepared.filter(row => row.status === 'ready');
  const inserted = await tx(async ({ one: txOne }) => {
    const created = [];
    for (const row of candidates) {
      await txOne(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [row.phone]);
      const duplicate = await txOne(`SELECT id FROM leads WHERE org_id=$1 AND phone=$2 AND stage <> 'lost' LIMIT 1`, [req.user.org, row.phone]);
      if (duplicate) continue;
      const lead = await txOne(`INSERT INTO leads (org_id,name,phone,email,project_id,source,source_ref,budget,config_pref,stage,temperature)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'new','warm') RETURNING id`,
      [req.user.org, row.name, row.phone, row.email, row.project_id, row.source, row.campaign, row.budget, row.config_pref]);
      await txOne(`INSERT INTO lead_events (lead_id,actor_id,kind,body) VALUES ($1,$2,'created','Imported from validated CSV')`, [lead.id, req.user.id]);
      created.push(lead.id);
    }
    return created;
  });
  res.json({ imported: inserted.length, skipped_duplicates: prepared.filter(row => row.status === 'duplicate').length + candidates.length - inserted.length, invalid: prepared.filter(row => row.status === 'invalid').length });
}));

r.get('/leads/:id', allow('admin', 'sales', 'broker'), h(async (req, res) => {
  const l = await leadFor(req.user, req.params.id);
  const [events, visits, chats, shares, assigned, broker, project, unit] = await Promise.all([
    many(`SELECT e.*, u.name AS actor FROM lead_events e LEFT JOIN users u ON u.id = e.actor_id WHERE e.lead_id = $1 ORDER BY e.created_at DESC`, [l.id]),
    many(`SELECT v.*, u.name AS agent, p.name AS project_name, p.map_url, p.location FROM site_visits v LEFT JOIN users u ON u.id = v.agent_id LEFT JOIN projects p ON p.id = v.project_id WHERE v.lead_id = $1 ORDER BY v.scheduled_at DESC`, [l.id]),
    many(`SELECT c.id, c.ai_enabled, w.display, u.name AS agent FROM chats c LEFT JOIN wa_numbers w ON w.id = c.wa_number_id LEFT JOIN users u ON u.id = c.agent_id WHERE c.lead_id = $1`, [l.id]),
    many(`SELECT s.token, s.views, s.last_viewed, s.created_at, u.unit_no FROM share_links s LEFT JOIN units u ON u.id = s.unit_id WHERE s.lead_id = $1 ORDER BY s.created_at DESC`, [l.id]),
    l.assigned_to ? one(`SELECT id, name, role, phone FROM users WHERE id = $1`, [l.assigned_to]) : null,
    l.broker_id ? one(`SELECT id, name, phone, profile->>'firm' AS firm FROM users WHERE id = $1`, [l.broker_id]) : null,
    l.project_id ? one(`SELECT id, name, map_url, location FROM projects WHERE id = $1`, [l.project_id]) : null,
    l.unit_id ? one(`SELECT id, unit_no, status FROM units WHERE id = $1`, [l.unit_id]) : null,
  ]);
  const prioritySignals = await one(`SELECT
      (SELECT count(*)::int FROM share_links sh WHERE sh.lead_id = $1 AND sh.last_viewed >= now() - interval '30 days') AS recent_share_views,
      (SELECT max(c.last_customer_at) FROM chats c WHERE c.lead_id = $1) AS last_customer_message_at`, [l.id]);
  res.json({ ...protectCustomerFields({ ...l, ...prioritySignals, ...prioritizeLead({ ...l, ...prioritySignals }) }, req.user.role), events, visits: protectCustomerRows(visits, req.user.role), chats, shares, assigned, broker, project, unit });
}));

/** Manual lead, walk-in, or a broker registering their client (lead protection: first registration wins). */
r.post('/leads', allow('admin', 'sales', 'broker'), h(async (req, res) => {
  const b = req.body || {};
  if (Object.keys(b).some(key => !LEAD_CREATE_FIELDS.includes(key))) throw fail(400, 'Unsupported lead field');
  const name = text(b.name, 'Name', { optional: false, max: 160 });
  const rawPhone = validPhone(b.phone, 'Phone', { optional: false });
  const phone = meta.normPhone(rawPhone);
  if (phone.length < 10 || phone.length > 15) throw fail(400, 'Enter a valid phone number');
  const email = b.email === '' || b.email === null ? null : validEmail(b.email, 'Email');
  for (const [key, label, max] of [['budget', 'Budget', 100], ['config_pref', 'Property preference', 120], ['purpose', 'Purpose', 120], ['timeline', 'Timeline', 120], ['notes', 'Notes', 5000], ['followup_note', 'Follow-up note', 1000]]) {
    if (b[key] !== undefined && b[key] !== null) text(b[key], label, { max });
  }
  if (b.stage !== undefined) oneOf(b.stage, 'Lead stage', STAGES, { optional: false });
  if (b.temperature !== undefined) oneOf(b.temperature, 'Lead temperature', TEMPERATURES, { optional: false });
  const whatsappConsent = b.whatsapp_consent === undefined ? null : oneOf(b.whatsapp_consent, 'WhatsApp contact preference', ['unknown', 'opted_in', 'opted_out'], { optional: false });
  if (b.source !== undefined) oneOf(b.source, 'Lead source', LEAD_SOURCES, { optional: false });
  if (b.auto_assign !== undefined && typeof b.auto_assign !== 'boolean') throw fail(400, 'Auto-assign must be true or false');
  const followupAt = b.followup_at ? dateValue(b.followup_at, 'Follow-up date', { optional: false }) : null;
  if (b.followup_type) oneOf(b.followup_type, 'Follow-up type', ['call', 'whatsapp', 'meeting', 'doc'], { optional: false });
  if (b.project_id) uuid(b.project_id, 'Project ID');
  if (b.assigned_to) uuid(b.assigned_to, 'Assignee ID');
  if (b.project_id && !(await one(`SELECT 1 FROM projects WHERE id = $1 AND org_id = $2`, [b.project_id, req.user.org]))) throw fail(400, 'Project is not part of this organization');
  if (req.user.role === 'admin' && b.assigned_to) await assertOrgUser(b.assigned_to, req.user.org, ['sales', 'broker']);
  const dupe = await one(`SELECT l.id, l.broker_id, l.assigned_to, u.name AS owner FROM leads l LEFT JOIN users u ON u.id = COALESCE(l.broker_id, l.assigned_to)
                          WHERE l.org_id = $1 AND l.phone = $2 AND l.stage <> 'lost'`, [req.user.org, phone]);
  if (dupe) throw fail(409, `This customer is already registered${dupe.owner ? ' with ' + dupe.owner : ''}.`);
  const isBroker = req.user.role === 'broker';
  const lead = await one(
    `INSERT INTO leads (org_id, project_id, name, phone, email, source, budget, config_pref, purpose, timeline, notes, broker_id, assigned_to, assigned_at, first_touch_at, stage, followup_at, followup_type, followup_note, whatsapp_consent, whatsapp_consent_updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, CASE WHEN $13::uuid IS NULL THEN NULL ELSE now() END, CASE WHEN $13::uuid IS NULL THEN NULL ELSE now() END, $14, $15, $16, $17, COALESCE($18, 'unknown'), CASE WHEN $18::text IS NOT NULL THEN now() END) RETURNING *`,
    [req.user.org, b.project_id || null, name, phone, email || null, isBroker ? 'broker' : (b.source || 'manual'), b.budget, b.config_pref, b.purpose, b.timeline, b.notes,
      isBroker ? req.user.id : null, req.user.role === 'admin' ? (b.assigned_to || null) : req.user.id, b.stage || 'contacted',
      followupAt, b.followup_type || 'call', b.followup_note || null, whatsappConsent]);
  await logLead(lead.id, req.user.id, 'created', isBroker ? `Registered by broker ${req.user.name}` : `Added by ${req.user.name}`);
  if (lead.followup_at) {
    const fDate = new Date(lead.followup_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
    await logLead(lead.id, req.user.id, 'followup', `Follow-up (${lead.followup_type}) scheduled for ${fDate}${lead.followup_note ? ': ' + lead.followup_note : ''}`);
  }
  if (isBroker) await notify(req.user.org, null, 'lead', `Broker ${req.user.name} registered ${b.name}`, `/leads/${lead.id}`);
  let responseLead = lead;
  if (req.user.role === 'admin' && !lead.assigned_to && b.auto_assign) {
    const assignee = await assignLead(lead.id, { actorId: req.user.id });
    if (assignee) responseLead = await one(`SELECT * FROM leads WHERE id = $1`, [lead.id]);
  }
  res.json(protectCustomerFields(responseLead, req.user.role));
}));

r.patch('/leads/:id', allow('admin', 'sales', 'broker'), h(async (req, res) => {
  const l = await leadFor(req.user, req.params.id);
  const b = req.body || {};
  if (Object.keys(b).some(key => !LEAD_PATCH_FIELDS.includes(key))) throw fail(400, 'Unsupported lead field');
  if (b.name !== undefined) text(b.name, 'Name', { optional: false, max: 160 });
  if (b.email !== undefined && b.email !== null && b.email !== '') validEmail(b.email, 'Email', { optional: false });
  for (const [key, label, max] of [['budget', 'Budget', 100], ['config_pref', 'Property preference', 120], ['purpose', 'Purpose', 120], ['timeline', 'Timeline', 120], ['notes', 'Notes', 5000], ['lost_reason', 'Lost reason', 500], ['followup_note', 'Follow-up note', 1000]]) {
    if (b[key] !== undefined && b[key] !== null) text(b[key], label, { max });
  }
  if (b.stage !== undefined) oneOf(b.stage, 'Lead stage', STAGES, { optional: false });
  if (b.temperature !== undefined) oneOf(b.temperature, 'Lead temperature', TEMPERATURES, { optional: false });
  if (b.stage === 'lost' && !String(b.lost_reason ?? l.lost_reason ?? '').trim()) throw fail(400, 'Choose a lost reason before marking this lead lost');
  if (b.project_id) uuid(b.project_id, 'Project ID');
  if (b.unit_id) uuid(b.unit_id, 'Unit ID');
  const projectId = b.project_id || l.project_id;
  if (b.project_id && !(await one(`SELECT 1 FROM projects WHERE id = $1 AND org_id = $2`, [b.project_id, req.user.org]))) throw fail(400, 'Project is not part of this organization');
  if (b.unit_id) {
    const unit = await one(`SELECT u.project_id FROM units u JOIN projects p ON p.id = u.project_id WHERE u.id = $1 AND p.org_id = $2`, [b.unit_id, req.user.org]);
    if (!unit || (projectId && unit.project_id !== projectId)) throw fail(400, 'Unit must belong to the selected project and organization');
  }
  const followupAt = b.followup_at !== undefined ? (b.followup_at ? dateValue(b.followup_at, 'Follow-up date', { optional: false }) : null) : l.followup_at;
  const followupType = b.followup_type !== undefined ? b.followup_type : l.followup_type;
  if (followupType) oneOf(followupType, 'Follow-up type', ['call', 'whatsapp', 'meeting', 'doc'], { optional: false });
  const followupNote = b.followup_note !== undefined ? b.followup_note : l.followup_note;
  const whatsappConsent = b.whatsapp_consent === undefined ? null : oneOf(b.whatsapp_consent, 'WhatsApp contact preference', ['unknown', 'opted_in', 'opted_out'], { optional: false });

  const row = await one(
    `UPDATE leads SET name = COALESCE($2,name), email = COALESCE($3,email), budget = COALESCE($4,budget), config_pref = COALESCE($5,config_pref),
       purpose = COALESCE($6,purpose), timeline = COALESCE($7,timeline), notes = COALESCE($8,notes), stage = COALESCE($9,stage),
       temperature = COALESCE($10,temperature), project_id = COALESCE($11,project_id), unit_id = COALESCE($12,unit_id), lost_reason = COALESCE($13,lost_reason),
       followup_at = $14, followup_type = $15, followup_note = $16,
       whatsapp_consent = COALESCE($18, whatsapp_consent),
       whatsapp_consent_updated_at = CASE WHEN $18::text IS NOT NULL THEN now() ELSE whatsapp_consent_updated_at END,
       first_touch_at = COALESCE(first_touch_at, CASE WHEN assigned_to = $17 THEN now() END), updated_at = now()
     WHERE id = $1 RETURNING *`,
    [l.id, b.name, b.email, b.budget, b.config_pref, b.purpose, b.timeline, b.notes, b.stage, b.temperature, b.project_id, b.unit_id, b.lost_reason,
     followupAt, followupType, followupNote, req.user.id, whatsappConsent]);

  if (b.stage && b.stage !== l.stage) await logLead(l.id, req.user.id, 'stage', `Stage: ${l.stage.replace('_', ' ')} → ${b.stage.replace('_', ' ')}${b.lost_reason ? ` (${b.lost_reason})` : ''}`);

  if (b.followup_at !== undefined) {
    if (b.followup_at) {
      const fDate = new Date(b.followup_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
      await logLead(l.id, req.user.id, 'followup', `Follow-up (${b.followup_type || 'call'}) scheduled for ${fDate}${b.followup_note ? ': ' + b.followup_note : ''}`);
    } else {
      await logLead(l.id, req.user.id, 'followup', `Follow-up marked completed`);
    }
  }

  res.json(protectCustomerFields(row, req.user.role));
}));

r.delete('/leads/:id', allow('admin', 'sales'), h(async (req, res) => {
  const l = await leadFor(req.user, req.params.id);
  await q(`DELETE FROM leads WHERE id = $1`, [l.id]);
  res.sendStatus(204);
}));

r.post('/leads/:id/assign', allow('admin'), h(async (req, res) => {
  await leadFor(req.user, req.params.id);
  const userId = req.body?.user_id || null;
  if (userId) await assertOrgUser(userId, req.user.org, ['sales', 'broker']);
  const who = await assignLead(req.params.id, { actorId: req.user.id, userId, reason: userId ? 'manual' : 'auto' });
  if (!who) throw fail(409, 'Nobody available to assign');
  res.json(who);
}));

r.post('/leads/:id/events', allow('admin', 'sales', 'broker'), h(async (req, res) => {
  const l = await leadFor(req.user, req.params.id);
  const { kind = 'note', body } = req.body || {};
  if (!body) throw fail(400, 'Write something');
  await logLead(l.id, req.user.id, ['note', 'call', 'followup'].includes(kind) ? kind : 'note', body);
  if (kind === 'call') await q(`UPDATE leads SET first_touch_at = COALESCE(first_touch_at, now()), stage = CASE WHEN stage = 'new' THEN 'contacted' ELSE stage END WHERE id = $1`, [l.id]);
  res.sendStatus(204);
}));

// ---------- site visits ----------
r.get('/visits', allow('admin', 'sales', 'broker'), h(async (req, res) => {
  const s = scope(req.user);
  const rows = await many(`SELECT v.*, l.name, l.phone, l.config_pref, p.name AS project_name, p.map_url, p.location, a.name AS agent, sb.name AS scheduler_name FROM site_visits v JOIN leads l ON l.id = v.lead_id
                       LEFT JOIN projects p ON p.id = v.project_id LEFT JOIN users a ON a.id = v.agent_id LEFT JOIN users sb ON sb.id = v.scheduled_by
                       WHERE v.org_id = $1${s.sql} AND (v.status = 'to_confirm' OR v.scheduled_at > now() - interval '60 days') ORDER BY v.scheduled_at DESC NULLS LAST`, [req.user.org, ...s.vals]);
  res.json(protectCustomerRows(rows, req.user.role));
}));

r.post('/visits', allow('admin', 'sales', 'broker'), h(async (req, res) => {
  const { lead_id, project_id, scheduled_at, visitors_count = 1, transport = 'Self', pickup_address } = req.body || {};
  if (!lead_id) throw fail(400, 'Select a lead');
  const scheduledAt = futureDateTime(scheduled_at, 'Visit date and time');
  const visitors = number(visitors_count, 'Visitor count', { min: 1, max: 100, integer: true, optional: false });
  oneOf(transport, 'Transport preference', ['Self', 'cab', 'self'], { optional: false });
  const l = await leadFor(req.user, lead_id);
  if (project_id) {
    const project = await one(`SELECT id FROM projects WHERE id = $1 AND org_id = $2`, [project_id, req.user.org]);
    if (!project || (l.project_id && l.project_id !== project_id)) throw fail(400, 'Project must match the lead and organization');
  }
  const { visit: v, created } = await scheduleVisitOnce({
    orgId: req.user.org, leadId: l.id, projectId: project_id || l.project_id,
    agentId: l.assigned_to || req.user.id, scheduledAt, visitorsCount: visitors, transport, pickupAddress: pickup_address || null, source: 'employee', scheduledBy: req.user.id,
  });

  await q(`UPDATE leads SET stage = 'visit_scheduled', first_touch_at = COALESCE(first_touch_at, now()), followup_at = NULL, followup_note = NULL WHERE id = $1 AND stage IN ('new','contacted','qualified','visit_scheduled')`, [l.id]);
  const when = new Date(scheduled_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
  if (created) {
    const details = await visitDetailsFor(req.user.org, v.project_id, v.scheduled_at);
    await logLead(l.id, req.user.id, 'visit', `Site visit scheduled for ${when} (${visitors_count} visitors · ${transport})`);
    await notifyBuyerForLeadVisit(req.user.org, l.id, `Your site visit is scheduled. ${details}`);
    const delivered = await sendVisitWhatsAppWhenAllowed(req.user.org, l.id, `Your site visit is scheduled. ${details}`);
    if (l.assigned_to) await notify(req.user.org, l.assigned_to, 'visit', delivered ? `Site visit booked for ${l.name || l.phone}: ${when} IST.` : `Site visit booked for ${l.name || l.phone}: ${when} IST. Share the address and map using an approved template; the 24-hour WhatsApp window is closed.`, `/leads/${l.id}`);
  }
  res.json(v);
}));

r.post('/leads/:id/visits', allow('admin', 'sales', 'broker'), h(async (req, res) => {
  const l = await leadFor(req.user, req.params.id);
  const { scheduled_at, visitors_count = 1, transport = 'Self', pickup_address } = req.body || {};
  const scheduledAt = futureDateTime(scheduled_at, 'Visit date and time');
  const visitors = number(visitors_count, 'Visitor count', { min: 1, max: 100, integer: true, optional: false });
  oneOf(transport, 'Transport preference', ['Self', 'cab', 'self'], { optional: false });
  const { visit: v, created } = await scheduleVisitOnce({
    orgId: req.user.org, leadId: l.id, projectId: l.project_id,
    agentId: l.assigned_to || req.user.id, scheduledAt, visitorsCount: visitors, transport, pickupAddress: pickup_address || null, source: 'employee', scheduledBy: req.user.id,
  });
  await q(`UPDATE leads SET stage = 'visit_scheduled', first_touch_at = COALESCE(first_touch_at, now()), followup_at = NULL, followup_note = NULL WHERE id = $1 AND stage IN ('new','contacted','qualified','visit_scheduled')`, [l.id]);
  const when = new Date(scheduled_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
  if (created) {
    const details = await visitDetailsFor(req.user.org, v.project_id, v.scheduled_at);
    await logLead(l.id, req.user.id, 'visit', `Site visit scheduled for ${when} (${visitors_count} visitors · ${transport})`);
    await notifyBuyerForLeadVisit(req.user.org, l.id, `Your site visit is scheduled. ${details}`);
    const delivered = await sendVisitWhatsAppWhenAllowed(req.user.org, l.id, `Your site visit is scheduled. ${details}`);
    if (l.assigned_to) await notify(req.user.org, l.assigned_to, 'visit', delivered ? `Site visit booked for ${l.name || l.phone}: ${when} IST.` : `Site visit booked for ${l.name || l.phone}: ${when} IST. Share the address and map using an approved template; the 24-hour WhatsApp window is closed.`, `/leads/${l.id}`);
  }
  res.json(v);
}));

// ---------- AI Features (Gemini) ----------
// Feature 7: AI Buyer Objection Resolver
r.post('/leads/:id/ai-objection', allow('admin', 'sales', 'broker'), h(async (req, res) => {
  const l = await leadFor(req.user, req.params.id);
  const { objection } = req.body || {};
  if (!objection) throw fail(400, 'Please enter the buyer objection');
  const project = l.project_id ? await one(`SELECT * FROM projects WHERE id = $1`, [l.project_id]) : {};
  const result = await resolveObjection({ project, lead: l, objection });
  const script = result.responseScript || result.pitch_script || result.whatsappMessage || '';
  const wa = result.whatsappMessage || script;
  const facts = Array.isArray(result.keyFacts) ? result.keyFacts : Array.isArray(result.key_facts) ? result.key_facts : [];
  res.json({
    ...result,
    pitch_script: script,
    responseScript: script,
    whatsapp_message: wa,
    key_facts: facts,
    keyFacts: facts
  });
}));

// Feature 9: AI Sales Handover Memory
r.post('/leads/:id/ai-handover', allow('admin', 'sales', 'broker'), h(async (req, res) => {
  const l = await leadFor(req.user, req.params.id);
  const [events, visits, chats] = await Promise.all([
    many(`SELECT * FROM lead_events WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 30`, [l.id]),
    many(`SELECT * FROM site_visits WHERE lead_id = $1 ORDER BY scheduled_at DESC LIMIT 10`, [l.id]),
    many(`SELECT * FROM chats WHERE lead_id = $1`, [l.id]),
  ]);
  const brief = await generateHandoverBrief({ lead: l, events, visits, chats });
  await q(`UPDATE leads SET handover_summary = $2 WHERE id = $1`, [l.id, JSON.stringify(brief)]);
  await logLead(l.id, req.user.id, 'ai', `AI Sales Handover Briefing generated`);
  res.json(brief);
}));

// Feature 11: AI Site Visit Evidence Passport
r.post('/visits/:id/ai-passport', allow('admin', 'sales', 'broker'), h(async (req, res) => {
  const v = await one(`SELECT v.*, u.name as agent FROM site_visits v LEFT JOIN users u ON u.id = v.agent_id WHERE v.id = $1 AND v.org_id = $2`, [req.params.id, req.user.org]);
  if (!v) throw fail(404, 'Visit not found');
  await leadFor(req.user, v.lead_id);
  const l = await one(`SELECT * FROM leads WHERE id = $1`, [v.lead_id]);
  const p = await one(`SELECT * FROM projects WHERE id = $1`, [v.project_id]);
  const body = req.body || {};
  const unit = (body.flats_shown || v.interested_unit) ? await one(`SELECT * FROM units WHERE project_id = $1 AND upper(unit_no) = upper($2)`, [v.project_id, body.flats_shown || v.interested_unit]) : {};
  const passport = await generateVisitPassportData({ visit: { ...v, ...body }, lead: l || {}, project: p || {}, unit: unit || {} });
  if (body.flats_shown) passport.flats_shown = body.flats_shown;
  if (body.price_quoted) passport.price_quoted = body.price_quoted;
  if (body.commitments) passport.commitments = body.commitments;
  if (body.questions) passport.questions = body.questions;
  await q(`UPDATE site_visits SET evidence_passport = $2 WHERE id = $1`, [v.id, JSON.stringify(passport)]);
  await logLead(v.lead_id, req.user.id, 'visit', `AI site visit notes record ${passport.recordId} created`);
  res.json({ passport, ...passport });
}));

// Feature 8: Smart Site Visit Route & Staff Allocation
r.get('/visits/allocation-suggestions', allow('admin', 'sales'), h(async (req, res) => {
  const { date = new Date().toISOString().slice(0, 10) } = req.query;
  const visitDate = dateValue(date, 'Allocation date', { optional: false }).slice(0, 10);
  const agents = await many(
    `SELECT u.id, u.name, u.role, u.profile,
       (SELECT count(*)::int FROM site_visits v WHERE v.agent_id = u.id AND v.status IN ('scheduled','confirmed') AND date_trunc('day', v.scheduled_at) = $2::date) AS today_visits
     FROM users u WHERE u.org_id = $1 AND u.role = 'sales' AND u.active ORDER BY today_visits ASC, u.name`,
    [req.user.org, visitDate]);

  const allVisits = await many(
    `SELECT v.id, v.scheduled_at, v.agent_id, v.status, u.name AS agent_name
     FROM site_visits v LEFT JOIN users u ON u.id = v.agent_id
     WHERE v.org_id = $1 AND date_trunc('day', v.scheduled_at) = $2::date AND v.status IN ('scheduled','confirmed')`,
    [req.user.org, visitDate]);

  // Detect overlapping visits (same agent, scheduled within 90 minutes of each other)
  const conflicts = [];
  for (let i = 0; i < allVisits.length; i++) {
    for (let j = i + 1; j < allVisits.length; j++) {
      const v1 = allVisits[i], v2 = allVisits[j];
      if (v1.agent_id && v1.agent_id === v2.agent_id) {
        const diffMin = Math.abs(new Date(v1.scheduled_at) - new Date(v2.scheduled_at)) / 60000;
        if (diffMin < 90) {
          conflicts.push({
            agentId: v1.agent_id,
            agentName: v1.agent_name,
            visit1: v1.id,
            visit2: v2.id,
            diffMinutes: Math.round(diffMin),
            message: `${v1.agent_name} has 2 visits scheduled within ${Math.round(diffMin)} minutes of each other.`,
          });
        }
      }
    }
  }

  res.json({
    date: visitDate,
    agents,
    conflicts,
    suggestedAgent: agents.find(a => (a.profile?.availability || 'available') === 'available') || agents[0],
  });
}));

r.patch('/visits/:id', allow('admin', 'sales', 'broker'), h(async (req, res) => {
  const { status, feedback, rating, interested_unit, reschedule_at } = req.body || {};
  oneOf(status, 'Visit status', ['scheduled', 'confirmed', 'done', 'no_show', 'cancelled', 'rescheduled']);
  const ratingValue = rating === undefined || rating === null || rating === '' ? null : number(rating, 'Visit rating', { min: 1, max: 5, integer: true, optional: false });
  if (status === 'rescheduled' && !reschedule_at) throw fail(400, 'A new date and time are required to reschedule');
  const cur = await one(`SELECT * FROM site_visits WHERE id = $1 AND org_id = $2`, [req.params.id, req.user.org]);
  if (!cur) throw fail(404, 'Visit not found');
  const visitLead = await leadFor(req.user, cur.lead_id);

  const transitions = {
    to_confirm: ['rescheduled', 'cancelled'],
    scheduled: ['confirmed', 'done', 'no_show', 'cancelled', 'rescheduled'],
    confirmed: ['done', 'no_show', 'cancelled', 'rescheduled'],
    done: [], no_show: [], cancelled: [], rescheduled: [],
  };
  if (status && status !== cur.status && !transitions[cur.status]?.includes(status)) {
    throw fail(409, `Visit cannot move from ${cur.status} to ${status}`);
  }

  let newTime = cur.scheduled_at;
  if (status === 'rescheduled') newTime = futureDateTime(reschedule_at, 'New visit date and time');
  // A reschedule updates the appointment to its new upcoming state. The prior
  // date and action remain in the lead event timeline.
  const nextStatus = status === 'rescheduled' ? 'scheduled' : status;

  const v = await one(
    `UPDATE site_visits SET status = COALESCE($3,status), feedback = COALESCE($4,feedback),
       rating = COALESCE($5,rating), interested_unit = COALESCE($6,interested_unit),
       scheduled_at = $7 WHERE id = $1 AND org_id = $2 RETURNING *`,
    [cur.id, req.user.org, nextStatus, feedback, ratingValue, interested_unit, newTime]);

  if (status === 'rescheduled') {
    await q(`UPDATE leads SET stage = CASE WHEN stage IN ('booked','lost') THEN stage ELSE 'visit_scheduled' END,
      followup_at = NULL, followup_note = NULL, updated_at = now() WHERE id = $1`, [v.lead_id]);
  }

  if (status === 'done') {
    await q(`UPDATE leads SET stage = 'visit_done' WHERE id = $1 AND stage IN ('visit_scheduled','qualified','contacted')`, [v.lead_id]);
    await logLead(v.lead_id, req.user.id, 'visit', `Site visit completed. Rating: ${rating ? rating + '/5 stars' : 'Good'}${interested_unit ? ` · Interested in: ${interested_unit}` : ''}${feedback ? ` · Notes: ${feedback}` : ''}`);
  } else if (status === 'confirmed') {
    await logLead(v.lead_id, req.user.id, 'visit', `Site visit confirmed by customer for ${new Date(v.scheduled_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}`);
  } else if (status === 'rescheduled') {
    const when = new Date(newTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
    await logLead(v.lead_id, req.user.id, 'visit', `Site visit rescheduled to ${when}${feedback ? ': ' + feedback : ''}`);
  } else if (status) {
    await logLead(v.lead_id, req.user.id, 'visit', `Visit marked ${status}${feedback ? ': ' + feedback : ''}`);
  }

  if (status) {
    const when = new Date(v.scheduled_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
    const buyerMessage = status === 'rescheduled' ? `Your site visit has been moved to ${when}. Open the buyer portal to review the updated details.`
      : status === 'confirmed' ? `Your site visit for ${when} is confirmed.`
        : status === 'cancelled' ? `Your site visit for ${when} has been cancelled. Please contact your advisor to arrange another time.`
          : status === 'done' ? `Your site visit on ${when} is marked complete. Thank you for visiting.`
            : status === 'no_show' ? `We couldn’t complete your site visit scheduled for ${when}. Contact your advisor to arrange another time.`
              : null;
    const visitDetails = await visitDetailsFor(req.user.org, v.project_id, v.scheduled_at);
    const completeBuyerMessage = ['rescheduled', 'confirmed'].includes(status) ? `Your site visit is ${status === 'rescheduled' ? 'updated' : 'confirmed'}. ${visitDetails}` : buyerMessage;
    if (completeBuyerMessage) await notifyBuyerForLeadVisit(req.user.org, v.lead_id, completeBuyerMessage);
    if (['rescheduled', 'confirmed'].includes(status)) await sendVisitWhatsAppWhenAllowed(req.user.org, v.lead_id, completeBuyerMessage);
    if (['rescheduled', 'confirmed'].includes(status) && cur.agent_id) {
      await notify(req.user.org, cur.agent_id, 'visit', `Site visit for ${visitLead.name || 'your client'} ${status === 'rescheduled' ? 'changed' : 'confirmed'}: ${when} IST.`, '/visits');
    }
  }

  res.json(v);
}));

// ---------- share links ----------
r.post('/share', allow('admin', 'sales', 'broker'), h(async (req, res) => {
  const { project_id, unit_id, lead_id } = req.body || {};
  const p = await one(`SELECT id FROM projects WHERE id = $1 AND org_id = $2`, [project_id, req.user.org]);
  if (!p) throw fail(404, 'Project not found');
  if (unit_id) {
    const unit = await one(`SELECT id FROM units WHERE id = $1 AND project_id = $2`, [unit_id, p.id]);
    if (!unit) throw fail(400, 'Unit must belong to the selected project');
  }
  if (lead_id) {
    const lead = await leadFor(req.user, lead_id);
    if (lead.project_id && lead.project_id !== p.id) throw fail(400, 'Lead must belong to the selected project');
  }
  const existing = await one(`SELECT * FROM share_links WHERE created_by = $1 AND project_id = $2 AND unit_id IS NOT DISTINCT FROM $3 AND lead_id IS NOT DISTINCT FROM $4`,
    [req.user.id, p.id, unit_id || null, lead_id || null]);
  const link = existing || await one(`INSERT INTO share_links (org_id, created_by, project_id, unit_id, lead_id) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.user.org, req.user.id, p.id, unit_id || null, lead_id || null]);
  if (lead_id && !existing) await logLead(lead_id, req.user.id, 'share', 'Shared a project link');
  res.json({ ...link, url: `${config.publicUrl}/s/${link.token}` });
}));
r.get('/share', allow('admin', 'sales', 'broker'), h(async (req, res) => {
  res.json(await many(`SELECT s.*, p.name AS project_name, u.unit_no, l.name AS lead_name FROM share_links s JOIN projects p ON p.id = s.project_id
                       LEFT JOIN units u ON u.id = s.unit_id LEFT JOIN leads l ON l.id = s.lead_id
                       WHERE s.org_id = $1 ${req.user.role === 'admin' ? '' : 'AND s.created_by = $2'} ORDER BY s.created_at DESC LIMIT 100`,
    req.user.role === 'admin' ? [req.user.org] : [req.user.org, req.user.id]));
}));

// ---------- chats (agent WhatsApp + AI twin) ----------
r.get('/chats', allow('admin', 'sales'), h(async (req, res) => {
  res.json(await many(
    `SELECT c.*, l.name, l.phone, l.stage, l.temperature, w.display, a.name AS agent,
       (SELECT body FROM chat_messages m WHERE m.chat_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_body,
       (SELECT sender FROM chat_messages m WHERE m.chat_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_sender,
       (SELECT created_at FROM chat_messages m WHERE m.chat_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_at,
       (SELECT delivery_status FROM chat_messages m WHERE m.chat_id = c.id AND m.sender IN ('agent','ai') AND m.ext_id IS NOT NULL ORDER BY created_at DESC LIMIT 1) AS last_delivery_status
     FROM chats c JOIN leads l ON l.id = c.lead_id LEFT JOIN wa_numbers w ON w.id = c.wa_number_id LEFT JOIN users a ON a.id = c.agent_id
     WHERE c.org_id = $1 ${req.user.role === 'admin' ? '' : 'AND c.agent_id = $2'} ORDER BY last_at DESC NULLS LAST LIMIT 200`,
    req.user.role === 'admin' ? [req.user.org] : [req.user.org, req.user.id]));
}));

r.post('/chats', allow('admin', 'sales'), h(async (req, res) => {
  const { lead_id, phone, name, initial_message } = req.body || {};
  let lead = null;
  if (lead_id) {
    lead = await one(`SELECT * FROM leads WHERE id = $1 AND org_id = $2`, [lead_id, req.user.org]);
  } else if (phone) {
    const ph = meta.normPhone(phone);
    lead = await one(`SELECT * FROM leads WHERE org_id = $1 AND phone = $2 AND stage <> 'lost'`, [req.user.org, ph]);
    if (!lead) {
      lead = await one(
        `INSERT INTO leads (org_id, name, phone, source, stage, assigned_to, assigned_at)
         VALUES ($1,$2,$3,'whatsapp','contacted',$4,now()) RETURNING *`,
        [req.user.org, name || ph, ph, req.user.id]);
      await logLead(lead.id, req.user.id, 'created', `Started new chat from WhatsApp by ${req.user.name}`);
    }
  }
  if (!lead) throw fail(400, 'Please select a lead or enter a valid mobile number');
  if (req.user.role === 'sales') await leadFor(req.user, lead.id);

  let num = await one(`SELECT * FROM wa_numbers WHERE org_id = $1 AND user_id = $2`, [req.user.org, req.user.id]);
  if (!num) num = await one(`SELECT * FROM wa_numbers WHERE org_id = $1 ORDER BY user_id NULLS LAST LIMIT 1`, [req.user.org]);
  if (!num) throw fail(409, 'No WhatsApp number connected yet. Connect one in Settings → Integrations.');
  if (lead.whatsapp_consent === 'opted_out' && initial_message) throw fail(409, 'This customer opted out of WhatsApp messages. Update their preference only after they explicitly opt in again.');

  let chat = await one(`SELECT * FROM chats WHERE org_id = $1 AND lead_id = $2 AND wa_number_id = $3`, [req.user.org, lead.id, num.id]);
  if (!chat) {
    chat = await one(
      `INSERT INTO chats (org_id, lead_id, wa_number_id, agent_id, last_customer_at)
       VALUES ($1,$2,$3,$4,NULL) RETURNING *`,
      [req.user.org, lead.id, num.id, req.user.id]);
  }

  let templateSent = false;
  if (initial_message && String(initial_message).trim()) {
    const text = String(initial_message).trim();
    const withinWindow = chat.last_customer_at && Date.now() - new Date(chat.last_customer_at) <= 24 * 3600e3;
    let sent;
    try {
      if (withinWindow) {
        sent = await meta.sendText(num, meta.normPhone(lead.phone), text);
      } else {
        if (lead.whatsapp_consent !== 'opted_in') throw fail(409, 'Record the customer’s WhatsApp opt-in before sending a template outside the 24-hour conversation window.');
        if (!config.meta.introTemplate) throw fail(409, 'An approved WhatsApp intro template is required to message a customer who has not messaged in the last 24 hours. Configure it in the server environment.');
        const templates = await meta.listTemplates(num);
        const approved = templates.find(item => item.name === config.meta.introTemplate && item.language === config.meta.templateLang && String(item.status).toUpperCase() === 'APPROVED');
        if (!approved) throw fail(409, 'The configured intro template is not approved for the configured language in Meta.');
        const templateBody = (approved.components || []).find(component => String(component.type).toUpperCase() === 'BODY')?.text || approved.name;
        const matches = [...templateBody.matchAll(/\{\{\s*(\d+)\s*\}\}/g)];
        if (/\{\{/.test(templateBody) && !matches.length) throw fail(409, 'The configured template uses named parameters, which this intro flow does not support yet.');
        const values = [lead.name || 'there', req.user.name, 'our project'];
        const indexes = matches.map(match => Number(match[1]));
        if (indexes.some(index => index < 1 || index > values.length)) throw fail(409, 'The configured intro template requires more values than this flow can provide.');
        sent = await meta.sendApprovedTemplate(num, meta.normPhone(lead.phone), approved.name, approved.language, indexes.map(index => values[index - 1]));
        templateSent = true;
      }
    } catch (e) {
      if (e.status) throw e;
      console.error('[wa send] initial message failed:', e.message);
      await one(`INSERT INTO chat_messages (chat_id,sender,body,delivery_status,delivery_error,status_updated_at) VALUES ($1,'agent',$2,'failed',$3,now())`,
        [chat.id, text, String(e.message).slice(0, 1000)]);
      await notifyAdminsOnce(req.user.org, 'integration_error', `WhatsApp send failed for ${lead.name || lead.phone}: ${String(e.message).slice(0, 350)}`, '/settings');
      throw fail(502, `WhatsApp did not send the message: ${e.message}`);
    }
    const body = withinWindow ? text : `Approved WhatsApp template sent: ${config.meta.introTemplate}`;
    await one(`INSERT INTO chat_messages (chat_id, sender, body, ext_id, delivery_status, status_updated_at) VALUES ($1,'agent',$2,$3,'accepted',now()) RETURNING *`,
      [chat.id, body, sent?.messages?.[0]?.id || null]);
    await q(`UPDATE chats SET last_agent_at = now() WHERE id = $1`, [chat.id]);
  }

  res.json({ ...chat, name: lead.name, phone: lead.phone, templateSent });
}));
async function chatFor(user, id) {
  const c = await one(`SELECT c.*, w.phone_number_id, w.waba_id, w.access_token, w.display, l.phone, l.name, l.whatsapp_consent, l.id AS lead_id FROM chats c JOIN wa_numbers w ON w.id = c.wa_number_id JOIN leads l ON l.id = c.lead_id
                       WHERE c.id = $1 AND c.org_id = $2 ${user.role === 'admin' ? '' : 'AND c.agent_id = $3'}`, user.role === 'admin' ? [id, user.org] : [id, user.org, user.id]);
  if (!c) throw fail(404, 'Chat not found');
  return c;
}
r.get('/chats/:id', allow('admin', 'sales'), h(async (req, res) => {
  const c = await chatFor(req.user, req.params.id);
  const { access_token, ...safe } = c;
  res.json({ ...safe, messages: await many(`SELECT * FROM chat_messages WHERE chat_id = $1 ORDER BY created_at`, [c.id]) });
}));
r.get('/whatsapp/templates', allow('admin', 'sales'), h(async (req, res) => {
  const numberId = req.query.wa_number_id;
  let num;
  if (numberId) {
    uuid(numberId, 'WhatsApp number ID');
    num = await one(`SELECT * FROM wa_numbers WHERE id = $1 AND org_id = $2 AND ($3 = 'admin' OR user_id = $4 OR user_id IS NULL)`, [numberId, req.user.org, req.user.role, req.user.id]);
  } else {
    num = await one(`SELECT * FROM wa_numbers WHERE org_id = $1 AND (user_id = $2 OR user_id IS NULL) ORDER BY user_id NULLS LAST LIMIT 1`, [req.user.org, req.user.id]);
  }
  if (!num) throw fail(404, 'No WhatsApp number is available to this user');
  try { res.json(await meta.listTemplates(num)); }
  catch (error) {
    await notifyAdminsOnce(req.user.org, 'integration_error', `WhatsApp template sync failed: ${String(error.message).slice(0, 400)}`, '/settings');
    throw fail(502, `Could not load WhatsApp templates: ${error.message}`);
  }
}));
r.post('/chats/:id/messages', allow('admin', 'sales'), h(async (req, res) => {
  const c = await chatFor(req.user, req.params.id);
  let text = String(req.body?.text || '').trim();
  if (!text) throw fail(400, 'Message is empty');
  const confirmedVisitAt = parseEmployeeVisitConfirmation(text);
  let visitDetails = '';
  if (confirmedVisitAt) {
    const project = await one(`SELECT name, location, map_url FROM projects WHERE id = $1 AND org_id = $2`, [(await leadFor(req.user, c.lead_id)).project_id, req.user.org]);
    visitDetails = visitMessageDetails({ when: confirmedVisitAt, projectName: project?.name, address: project?.location, mapUrl: project?.map_url });
    text = `${text}\n${visitDetails}`;
  }
  if (c.whatsapp_consent === 'opted_out') throw fail(409, 'This customer opted out of WhatsApp messages. Do not send another message unless they opt in again.');
  if (!c.last_customer_at || Date.now() - new Date(c.last_customer_at) > 24 * 3600e3) throw fail(409, 'WhatsApp allows free messages only within 24 hours of the customer’s last message. Call them, or wait for them to reply.');
  let sent;
  try { sent = await meta.sendText(c, meta.normPhone(c.phone), text); }
  catch (e) {
    await one(`INSERT INTO chat_messages (chat_id,sender,body,delivery_status,delivery_error,status_updated_at) VALUES ($1,'agent',$2,'failed',$3,now())`, [c.id, text, String(e.message).slice(0, 1000)]);
    await notifyAdminsOnce(req.user.org, 'integration_error', `WhatsApp send failed for ${c.name || c.phone}: ${String(e.message).slice(0, 350)}`, '/settings');
    throw fail(502, `WhatsApp could not send this message (${e.message}). Add this number's real Phone number ID and access token in Settings → LeadSathi & WhatsApp.`);
  }
  const m = await one(`INSERT INTO chat_messages (chat_id, sender, body, ext_id, delivery_status, status_updated_at) VALUES ($1,'agent',$2,$3,'accepted',now()) RETURNING *`, [c.id, text, sent?.messages?.[0]?.id || null]);
  await q(`UPDATE chats SET last_agent_at = now(), pending_ai_at = NULL WHERE id = $1`, [c.id]);
  await q(`UPDATE leads SET first_touch_at = COALESCE(first_touch_at, now()), stage = CASE WHEN stage = 'new' THEN 'contacted' ELSE stage END WHERE id = $1`, [c.lead_id]);
  if (confirmedVisitAt) {
    const lead = await leadFor(req.user, c.lead_id);
    const { visit, created } = await scheduleVisitOnce({ orgId: req.user.org, leadId: lead.id, projectId: lead.project_id, agentId: lead.assigned_to || req.user.id,
      scheduledAt: confirmedVisitAt, source: 'employee', scheduledBy: req.user.id, chatId: c.id, confirmationNote: text.slice(0, 1000) });
    await q(`UPDATE leads SET stage = CASE WHEN stage IN ('booked','lost') THEN stage ELSE 'visit_scheduled' END, followup_at = NULL, followup_note = NULL, updated_at = now() WHERE id = $1`, [lead.id]);
    const when = new Date(visit.scheduled_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
    await logLead(lead.id, req.user.id, 'visit', `${created ? 'Employee scheduled' : 'Employee confirmed/updated'} site visit for ${when} IST`);
    await q(`INSERT INTO chat_messages (chat_id, sender, body) VALUES ($1,'system',$2)`, [c.id, `Visit record ${created ? 'created' : 'updated'} from employee conversation: ${visitDetails}`]);
    if (lead.assigned_to) await notify(req.user.org, lead.assigned_to, 'visit', `Site visit ${created ? 'scheduled' : 'updated'} for ${lead.name || lead.phone}: ${when} IST`, '/visits');
  }
  res.json(m);
}));
r.post('/chats/:id/templates', allow('admin', 'sales'), h(async (req, res) => {
  const c = await chatFor(req.user, req.params.id);
  if (c.whatsapp_consent !== 'opted_in') throw fail(409, 'Record the customer’s WhatsApp opt-in before sending a template.');
  const b = req.body || {};
  if (Object.keys(b).some(key => !['name', 'language', 'parameters'].includes(key))) throw fail(400, 'Unsupported template send field');
  const name = text(b.name, 'Template name', { optional: false, max: 512 });
  const language = text(b.language, 'Template language', { optional: false, max: 32 });
  const params = b.parameters === undefined ? [] : b.parameters;
  if (!Array.isArray(params) || params.length > 20) throw fail(400, 'Template parameters must be a list of at most 20 values');
  for (const [index, value] of params.entries()) text(value, `Template value ${index + 1}`, { optional: false, max: 1024 });
  let templates;
  try { templates = await meta.listTemplates(c); }
  catch (error) { throw fail(502, `Could not verify the selected template with Meta: ${error.message}`); }
  const template = templates.find(item => item.name === name && item.language === language && String(item.status).toUpperCase() === 'APPROVED');
  if (!template) throw fail(409, 'This template is not approved for the selected language. Refresh the template list and choose an approved version.');
  const components = template.components || [];
  const bodyComponent = components.find(component => String(component.type).toUpperCase() === 'BODY');
  const bodyText = bodyComponent?.text || '';
  const allPlaceholders = bodyText.match(/\{\{\s*[^}]+\s*\}\}/g) || [];
  if (allPlaceholders.some(value => !/^\{\{\s*\d+\s*\}\}$/.test(value))) throw fail(400, 'This template uses named body parameters, which this chat flow does not support yet.');
  const expected = allPlaceholders.length;
  const unsupportedDynamicParts = components.some(component => {
    const type = String(component.type).toUpperCase();
    if (type === 'HEADER') return component.format !== 'TEXT' || /\{\{/.test(component.text || '');
    if (type === 'BUTTONS') return (component.buttons || []).some(button => /\{\{/.test(button.url || ''));
    return false;
  });
  if (unsupportedDynamicParts) throw fail(400, 'This template has dynamic header or button fields. Use a text-body template for sending from this chat.');
  if (params.length !== expected) throw fail(400, `This template requires ${expected} body value${expected === 1 ? '' : 's'}.`);
  let sent;
  try { sent = await meta.sendApprovedTemplate(c, meta.normPhone(c.phone), name, language, params); }
  catch (error) {
    await one(`INSERT INTO chat_messages (chat_id,sender,body,delivery_status,delivery_error,status_updated_at) VALUES ($1,'agent',$2,'failed',$3,now())`,
      [c.id, `[Template: ${name} · ${language}]`, String(error.message).slice(0, 1000)]);
    await notifyAdminsOnce(req.user.org, 'integration_error', `WhatsApp template send failed for ${c.name || c.phone}: ${String(error.message).slice(0, 350)}`, '/settings');
    throw fail(502, `WhatsApp could not send this template: ${error.message}`);
  }
  let preview = bodyText || name;
  params.forEach((value, index) => { preview = preview.replace(new RegExp(`\\{\\{\\s*${index + 1}\\s*\\}\\}`), value); });
  const message = await one(`INSERT INTO chat_messages (chat_id,sender,body,ext_id,delivery_status,status_updated_at)
    VALUES ($1,'agent',$2,$3,'accepted',now()) RETURNING *`, [c.id, `[Template: ${name} · ${language}] ${preview}`, sent?.messages?.[0]?.id || null]);
  await q(`UPDATE chats SET last_agent_at = now(), pending_ai_at = NULL WHERE id = $1`, [c.id]);
  await q(`UPDATE leads SET first_touch_at = COALESCE(first_touch_at,now()), stage = CASE WHEN stage = 'new' THEN 'contacted' ELSE stage END WHERE id = $1`, [c.lead_id]);
  res.json(message);
}));
r.patch('/chats/:id', allow('admin', 'sales'), h(async (req, res) => {
  const c = await chatFor(req.user, req.params.id);
  const on = !!req.body?.ai_enabled;
  await q(`UPDATE chats SET ai_enabled = $2, pending_ai_at = NULL WHERE id = $1`, [c.id, on]);
  await q(`INSERT INTO chat_messages (chat_id, sender, body) VALUES ($1,'system',$2)`, [c.id, on ? 'AI twin is back on for this chat' : `${req.user.name} took over this chat`]);
  res.sendStatus(204);
}));

// ---------- bookings ----------
r.get('/quotes', allow('admin', 'sales'), h(async (req, res) => {
  if (req.query.unit_id) uuid(req.query.unit_id, 'Unit ID');
  if (req.query.status) oneOf(req.query.status, 'Quote status', ['pending', 'approved', 'rejected', 'converted', 'expired'], { optional: false });
  const vals = [req.user.org];
  let where = 'q.org_id = $1';
  if (req.user.role !== 'admin') { vals.push(req.user.id); where += ` AND (q.created_by = $${vals.length} OR q.status = 'approved')`; }
  if (req.query.unit_id) { vals.push(req.query.unit_id); where += ` AND q.unit_id = $${vals.length}`; }
  if (req.query.status === 'pending') where += ` AND q.status = 'pending' AND q.expires_at > now()`;
  else if (req.query.status === 'expired') where += ` AND (q.status = 'expired' OR (q.status = 'pending' AND q.expires_at <= now()))`;
  else if (req.query.status) { vals.push(req.query.status); where += ` AND q.status = $${vals.length}`; }
  const rows = await many(`SELECT q.*, u.unit_no, p.name AS project_name, l.name AS lead_name, c.name AS created_by_name, d.name AS decided_by_name
    FROM price_quotes q JOIN units u ON u.id = q.unit_id JOIN projects p ON p.id = u.project_id
    LEFT JOIN leads l ON l.id = q.lead_id LEFT JOIN users c ON c.id = q.created_by LEFT JOIN users d ON d.id = q.decided_by
    WHERE ${where} ORDER BY CASE WHEN q.status = 'pending' THEN 0 ELSE 1 END, q.created_at DESC LIMIT 500`, vals);
  res.json(rows.map(row => row.status === 'pending' && new Date(row.expires_at) <= new Date() ? { ...row, status: 'expired' } : row));
}));

r.post('/quotes', allow('admin', 'sales'), h(async (req, res) => {
  const b = req.body || {};
  if (Object.keys(b).some(key => !['unit_id', 'lead_id', 'discount', 'note'].includes(key))) throw fail(400, 'Unsupported price quote field');
  uuid(b.unit_id, 'Unit ID');
  if (b.lead_id) uuid(b.lead_id, 'Lead ID');
  const discount = number(b.discount, 'Discount', { min: 1, max: 1_000_000_000, optional: false });
  const note = b.note == null || b.note === '' ? null : text(b.note, 'Offer note', { max: 1000 });
  const lead = b.lead_id ? await leadFor(req.user, b.lead_id) : null;
  const quote = await tx(async t => {
    const unit = await t.one(`SELECT u.*, p.org_id, p.rate_sqft, p.charges FROM units u JOIN projects p ON p.id = u.project_id
      WHERE u.id = $1 AND p.org_id = $2 FOR UPDATE OF u`, [b.unit_id, req.user.org]);
    if (!unit) throw fail(404, 'Unit not found');
    const holdIsActive = unit.status === 'hold' && unit.hold_until && new Date(unit.hold_until) > new Date();
    if (!['available', 'hold'].includes(unit.status) || (holdIsActive && unit.hold_by !== req.user.id && req.user.role !== 'admin')) {
      throw fail(409, 'This unit is not available for an offer');
    }
    if (lead?.project_id && lead.project_id !== unit.project_id) throw fail(400, 'Lead and unit must belong to the same project');
    const type = await t.one('SELECT * FROM unit_types WHERE id = $1 AND project_id = $2', [unit.unit_type_id, unit.project_id]);
    const listPrice = costSheet(unit, type, unit).total;
    if (discount >= listPrice) throw fail(400, 'Discount must be less than the unit price');
    const status = req.user.role === 'admin' ? 'approved' : 'pending';
    return t.one(`INSERT INTO price_quotes (org_id, unit_id, lead_id, created_by, list_price, discount, proposed_price, note, status, expires_at, decided_by, decided_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now() + interval '7 days',CASE WHEN $9 = 'approved' THEN $4::uuid END,CASE WHEN $9 = 'approved' THEN now() END)
      RETURNING *`, [req.user.org, unit.id, lead?.id || null, req.user.id, listPrice, discount, listPrice - discount, note, status]);
  });
  if (quote.status === 'pending') await notify(req.user.org, null, 'inventory', `Discount approval requested for ${quote.discount} on unit ${b.unit_id}`, '/inventory');
  res.status(201).json(quote);
}));

r.patch('/quotes/:id', allow('admin'), h(async (req, res) => {
  uuid(req.params.id, 'Quote ID');
  const b = req.body || {};
  if (Object.keys(b).some(key => !['status', 'decision_note'].includes(key))) throw fail(400, 'Unsupported quote decision field');
  oneOf(b.status, 'Decision', ['approved', 'rejected'], { optional: false });
  const decisionNote = b.decision_note == null || b.decision_note === '' ? null : text(b.decision_note, 'Decision note', { max: 1000 });
  const quote = await tx(async t => {
    const snapshot = await t.one('SELECT unit_id FROM price_quotes WHERE id = $1 AND org_id = $2', [req.params.id, req.user.org]);
    if (!snapshot) throw fail(404, 'Price offer not found');
    const unit = await t.one(`SELECT u.*, p.rate_sqft, p.charges FROM units u JOIN projects p ON p.id = u.project_id
      WHERE u.id = $1 AND p.org_id = $2 FOR UPDATE OF u`, [snapshot.unit_id, req.user.org]);
    const current = await t.one('SELECT * FROM price_quotes WHERE id = $1 AND org_id = $2 FOR UPDATE', [req.params.id, req.user.org]);
    if (!current) throw fail(404, 'Price offer not found');
    if (current.status !== 'pending') throw fail(409, 'This offer has already been decided');
    if (new Date(current.expires_at) <= new Date()) {
      await t.q(`UPDATE price_quotes SET status = 'expired', updated_at = now() WHERE id = $1`, [current.id]);
      return null;
    }
    if (!unit || !['available', 'hold'].includes(unit.status)) throw fail(409, 'This unit is no longer available for an offer');
    const type = await t.one('SELECT * FROM unit_types WHERE id = $1 AND project_id = $2', [unit.unit_type_id, unit.project_id]);
    if (Math.round(costSheet(unit, type, unit).total) !== Math.round(Number(current.list_price))) throw fail(409, 'Unit pricing changed; request a new offer');
    return t.one(`UPDATE price_quotes SET status = $2, decided_by = $3, decided_at = now(), decision_note = $4, updated_at = now()
      WHERE id = $1 RETURNING *`, [current.id, b.status, req.user.id, decisionNote]);
  });
  if (!quote) throw fail(409, 'This offer has expired');
  await notify(req.user.org, quote.created_by, 'inventory', `Your price offer was ${quote.status}${decisionNote ? ': ' + decisionNote : ''}`, '/inventory');
  res.json(quote);
}));

r.get('/bookings', h(async (req, res) => {
  const { role, id, org } = req.user;
  const where = role === 'admin' ? '' : role === 'sales' ? 'AND b.sold_by = $2' : role === 'broker' ? 'AND b.broker_id = $2' : role === 'customer' ? 'AND b.customer_id = $2' : 'AND false';
  const rows = await many(
    `SELECT b.*, u.unit_no, p.name AS project_name, c.name AS customer_name, c.phone AS customer_phone, s.name AS sold_by_name, br.name AS broker_name,
       (SELECT coalesce(sum(amount),0) FROM payments x WHERE x.booking_id = b.id) AS paid
     FROM bookings b JOIN units u ON u.id = b.unit_id JOIN projects p ON p.id = u.project_id
     LEFT JOIN users c ON c.id = b.customer_id LEFT JOIN users s ON s.id = b.sold_by LEFT JOIN users br ON br.id = b.broker_id
     WHERE b.org_id = $1 ${where} ORDER BY b.created_at DESC`, role === 'admin' ? [org] : [org, id]);
  res.json(protectCustomerRows(rows, role, 'customer_phone', 'customer_email'));
}));

r.get('/bookings/:id', h(async (req, res) => {
  const b = await one(`SELECT b.*, u.unit_no, u.floor, u.facing, t.name AS type_name, t.carpet_sqft, t.super_sqft, p.name AS project_name, p.id AS project_id,
                         c.name AS customer_name, c.email AS customer_email, c.phone AS customer_phone, s.name AS sold_by_name, br.name AS broker_name
                       FROM bookings b JOIN units u ON u.id = b.unit_id JOIN projects p ON p.id = u.project_id LEFT JOIN unit_types t ON t.id = u.unit_type_id
                       LEFT JOIN users c ON c.id = b.customer_id LEFT JOIN users s ON s.id = b.sold_by LEFT JOIN users br ON br.id = b.broker_id
                       WHERE b.id = $1 AND b.org_id = $2`, [req.params.id, req.user.org]);
  if (!b) throw fail(404, 'Booking not found');
  const mine = req.user.role === 'admin' || [b.sold_by, b.broker_id, b.customer_id].includes(req.user.id);
  if (!mine) throw fail(403, 'No access');
  b.payments = await many(`SELECT * FROM payments WHERE booking_id = $1 ORDER BY paid_on`, [b.id]);
  b.documents = (await many(`SELECT id, title, category, file_name, mime_type, size_bytes, created_at
    FROM booking_documents WHERE org_id = $1 AND booking_id = $2 ORDER BY created_at DESC`, [req.user.org, b.id]))
    .map(document => ({ ...document, url: signPrivateUrl('booking-documents', document.id, req.user.org, 3600) }));
  b.commissions = req.user.role === 'customer' ? [] : await many(`SELECT c.*, u.name FROM commissions c JOIN users u ON u.id = c.user_id WHERE c.booking_id = $1 ${req.user.role === 'admin' ? '' : 'AND c.user_id = $2'}`, req.user.role === 'admin' ? [b.id] : [b.id, req.user.id]);
  res.json(protectCustomerFields(b, req.user.role, 'customer_phone', 'customer_email'));
}));

/** Book a unit. Creates the customer login, payment schedule, broker commission and sales incentive in one go. */
r.post('/bookings', allow('admin', 'sales'), h(async (req, res) => {
  const b = req.body || {};
  if (b.price_quote_id) uuid(b.price_quote_id, 'Price quote ID');
  const unit = await one(`SELECT u.*, p.org_id, p.rate_sqft, p.charges, p.payment_plan, p.name AS project_name FROM units u JOIN projects p ON p.id = u.project_id WHERE u.id = $1 AND p.org_id = $2`, [b.unit_id, req.user.org]);
  if (!unit) throw fail(404, 'Unit not found');
  if (!['available', 'hold'].includes(unit.status)) throw fail(409, `${unit.unit_no} is already ${unit.status}`);
  const initialHoldActive = unit.status === 'hold' && unit.hold_until && new Date(unit.hold_until) > new Date();
  if (initialHoldActive && unit.hold_by !== req.user.id && req.user.role !== 'admin') throw fail(409, `${unit.unit_no} is on hold by someone else`);
  const discount = number(b.discount ?? 0, 'Discount', { min: 0, max: 1_000_000_000, optional: false });
  const bookingAmount = number(b.booking_amount ?? 0, 'Booking amount', { min: 0, max: 1_000_000_000, optional: false });
  const bookingDate = b.booking_date ? dateValue(b.booking_date, 'Booking date', { optional: false }) : null;
  if (b.payment_mode !== undefined) oneOf(b.payment_mode, 'Payment mode', ['NEFT', 'RTGS', 'Cheque', 'UPI', 'Home loan disbursal'], { optional: false });
  if (b.payment_ref !== undefined && (typeof b.payment_ref !== 'string' || b.payment_ref.length > 120)) throw fail(400, 'Payment reference must be at most 120 characters');
  let lead = b.lead_id ? await leadFor(req.user, b.lead_id) : null;
  if (b.lead_id && !lead) throw fail(404, 'Lead not found');
  if (lead?.project_id && lead.project_id !== unit.project_id) throw fail(400, 'Lead and unit must belong to the same project');
  const custName = b.customer_name || lead?.name;
  const rawCustEmail = b.customer_email || lead?.email;
  const custPhone = meta.normPhone(b.customer_phone || lead?.phone);
  // Preserve first-touch source attribution when staff books a customer without selecting the lead.
  if (!lead && custPhone) {
    const candidates = await many(`SELECT id FROM leads WHERE org_id = $1 AND phone = $2 AND stage <> 'lost'
      AND (project_id = $3 OR project_id IS NULL) AND ($4 = 'admin' OR assigned_to = $5)
      ORDER BY created_at DESC LIMIT 2`, [req.user.org, custPhone, unit.project_id, req.user.role, req.user.id]);
    if (candidates.length === 1) lead = await leadFor(req.user, candidates[0].id);
  }
  if (!custName || !rawCustEmail) throw fail(400, 'Customer name and email are needed (the email becomes their portal login)');
  const custEmail = validEmail(rawCustEmail, 'Customer email', { optional: false });
  const leadAssignee = lead?.assigned_to ? await one(`SELECT id, role, active FROM users WHERE id = $1 AND org_id = $2`, [lead.assigned_to, req.user.org]) : null;
  const soldBy = req.user.role === 'sales' ? req.user.id : (b.sold_by || (leadAssignee?.active && leadAssignee.role === 'sales' ? leadAssignee.id : null));
  const brokerId = req.user.role === 'admin' ? (b.broker_id || lead?.broker_id || null) : (lead?.broker_id || null);
  if (req.user.role === 'admin' && soldBy) await assertOrgUser(soldBy, req.user.org, ['sales']);
  if (brokerId) await assertOrgUser(brokerId, req.user.org, ['broker']);
  const temp = crypto.randomBytes(5).toString('base64url');
  let bookedUnit = unit, deal = 0;

  const out = await tx(async t => {
    const lockedUnit = await t.one(`SELECT u.*, p.org_id, p.rate_sqft, p.charges, p.payment_plan, p.name AS project_name
                                   FROM units u JOIN projects p ON p.id = u.project_id
                                   WHERE u.id = $1 AND p.org_id = $2 FOR UPDATE OF u`, [b.unit_id, req.user.org]);
    if (!lockedUnit) throw fail(404, 'Unit not found');
    if (!['available', 'hold'].includes(lockedUnit.status)) throw fail(409, `${lockedUnit.unit_no} is already ${lockedUnit.status}`);
    const holdActive = lockedUnit.status === 'hold' && lockedUnit.hold_until && new Date(lockedUnit.hold_until) > new Date();
    if (holdActive && lockedUnit.hold_by !== req.user.id && req.user.role !== 'admin') throw fail(409, `${lockedUnit.unit_no} is on hold by someone else`);
    const type = await t.one(`SELECT * FROM unit_types WHERE id = $1 AND project_id = $2`, [lockedUnit.unit_type_id, lockedUnit.project_id]);
    const listPrice = costSheet(lockedUnit, type, lockedUnit).total;
    let priceQuote = null;
    if (discount > 0 || b.price_quote_id) {
      if (!b.price_quote_id) throw fail(409, 'An approved price offer is required for a discount');
      priceQuote = await t.one(`SELECT * FROM price_quotes WHERE id = $1 AND org_id = $2 AND unit_id = $3 FOR UPDATE`,
        [b.price_quote_id, req.user.org, lockedUnit.id]);
      if (!priceQuote) throw fail(404, 'Price offer not found for this unit');
      if (priceQuote.status !== 'approved' || new Date(priceQuote.expires_at) <= new Date()) throw fail(409, 'This price offer is not approved or has expired');
      if (priceQuote.lead_id && priceQuote.lead_id !== (lead?.id || null)) throw fail(409, 'This offer was approved for a different lead');
      if (Math.round(Number(priceQuote.discount)) !== Math.round(discount) || Math.round(Number(priceQuote.list_price)) !== Math.round(listPrice)) throw fail(409, 'The approved offer no longer matches this price');
    }
    deal = Math.round(listPrice - discount);
    if (bookingAmount > deal) throw fail(400, 'Booking amount cannot exceed the deal value');
    bookedUnit = lockedUnit;
    const claimed = await t.one(`UPDATE units SET status = 'booked', hold_by = NULL, hold_until = NULL, updated_at = now()
                                 WHERE id = $1 AND status IN ('available','hold')
                                   AND (status <> 'hold' OR hold_until IS NULL OR hold_until <= now() OR hold_by = $2 OR $3 = 'admin') RETURNING id`,
      [lockedUnit.id, req.user.id, req.user.role]);
    if (!claimed) throw fail(409, `${lockedUnit.unit_no} is no longer available to book`);
    let cust = await t.one(`SELECT id FROM users WHERE org_id = $1 AND lower(email) = lower($2)`, [req.user.org, custEmail]);
    let newLogin = false;
    if (cust) {
      const customerRole = await t.one(`SELECT id FROM users WHERE id = $1 AND role = 'customer'`, [cust.id]);
      if (!customerRole) throw fail(409, 'That email is already used by a non-customer account');
    } else { cust = await t.one(`INSERT INTO users (org_id, role, name, email, phone, password_hash) VALUES ($1,'customer',$2,$3,$4,$5) RETURNING id`, [req.user.org, custName, custEmail, custPhone, await bcrypt.hash(temp, 10)]); newLogin = true; }
    const booking = await t.one(
      `INSERT INTO bookings (org_id, unit_id, lead_id, customer_id, sold_by, broker_id, deal_value, discount, booking_amount, booking_date, schedule, notes, price_quote_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, COALESCE($10::date, current_date), $11, $12, $13) RETURNING *`,
      [req.user.org, lockedUnit.id, lead?.id || null, cust.id, soldBy, brokerId, deal, discount, bookingAmount, bookingDate, JSON.stringify(scheduleFor(lockedUnit, deal)), b.notes || null, priceQuote?.id || null]);
    if (priceQuote) await t.q(`UPDATE price_quotes SET status = 'converted', updated_at = now() WHERE id = $1 AND status = 'approved'`, [priceQuote.id]);
    if (bookingAmount > 0) await t.q(`INSERT INTO payments (booking_id, amount, mode, ref, milestone) VALUES ($1,$2,$3,$4,'Booking amount')`, [booking.id, bookingAmount, b.payment_mode || null, b.payment_ref || null]);
    if (lead) await t.q(`UPDATE leads SET stage = 'booked', unit_id = $2, updated_at = now() WHERE id = $1`, [lead.id, lockedUnit.id]);
    // money for the people who sold it
    for (const [uid, kind] of [[soldBy, 'sales_incentive'], [brokerId, 'broker_commission']]) {
      if (!uid) continue;
      const u = await t.one(`SELECT role, profile FROM users WHERE id = $1`, [uid]);
      const rule = kind === 'sales_incentive' ? u.profile?.incentive : u.profile?.commission;
      if (!rule?.value) continue;
      const amount = rule.type === 'flat' ? Number(rule.value) : Math.round(deal * Number(rule.value) / 100);
      const basis = rule.type === 'flat' ? `Flat ${inr(rule.value)} per unit` : `${rule.value}% of ${inr(deal)}`;
      await t.q(`INSERT INTO commissions (org_id, booking_id, user_id, kind, basis, amount) VALUES ($1,$2,$3,$4,$5,$6)`, [req.user.org, booking.id, uid, kind, basis, amount]);
    }
    return { booking, newLogin };
  });
  if (lead) await logLead(lead.id, req.user.id, 'stage', `Booked ${bookedUnit.unit_no} for ${inr(deal)}`);
  await notify(req.user.org, null, 'booking', `${bookedUnit.unit_no} (${bookedUnit.project_name}) booked for ${inr(deal)} by ${req.user.name}`, `/bookings/${out.booking.id}`);
  if (brokerId && brokerId !== req.user.id) await notify(req.user.org, brokerId, 'booking', `Your client ${custName} booked ${bookedUnit.unit_no}. Commission added.`, `/bookings/${out.booking.id}`);
  res.json({ ...out.booking, customer_login: out.newLogin ? { email: custEmail, temp_password: temp } : null });
}));

r.patch('/bookings/:id', allow('admin', 'sales'), h(async (req, res) => {
  const { status, notes, handover_status, handover_docs, registry_checklist } = req.body || {};
  const validStatuses = ['booked', 'agreement', 'registered', 'possession', 'cancelled'];
  if (status !== undefined) oneOf(status, 'Booking status', validStatuses, { optional: false });
  if (req.user.role === 'sales' && ['registered', 'possession', 'cancelled'].includes(status)) throw fail(403, 'Only an admin can register, hand over, or cancel a booking');
  if (req.user.role !== 'admin' && (handover_status !== undefined || handover_docs !== undefined || registry_checklist !== undefined)) {
    throw fail(403, 'Only an admin can update handover and registry records');
  }
  if (registry_checklist !== undefined) validateRegistryChecklist(registry_checklist);
  const b = await tx(async t => {
    const found = await t.one(`SELECT unit_id FROM bookings WHERE id = $1 AND org_id = $2`, [req.params.id, req.user.org]);
    if (!found) throw fail(404, 'Booking not found');
    await t.one(`SELECT id FROM units WHERE id = $1 FOR UPDATE`, [found.unit_id]);
    const cur = await t.one(`SELECT id, sold_by, unit_id, status FROM bookings WHERE id = $1 AND org_id = $2 FOR UPDATE`, [req.params.id, req.user.org]);
    if (!cur) throw fail(404, 'Booking not found');
    if (req.user.role === 'sales' && cur.sold_by !== req.user.id) throw fail(404, 'Booking not found');
    const transitions = {
      booked: ['agreement', 'cancelled'],
      agreement: ['registered', 'cancelled'],
      registered: ['possession'],
      possession: [],
      cancelled: [],
    };
    if (status && status !== cur.status && !transitions[cur.status]?.includes(status)) {
      throw fail(409, `Booking cannot move from ${cur.status} to ${status}`);
    }
    const updated = await t.one(`UPDATE bookings SET
      status = COALESCE($3, status),
      notes = COALESCE($4, notes),
      handover_status = COALESCE($5, handover_status),
      handover_docs = COALESCE($6, handover_docs),
      registry_checklist = COALESCE($7, registry_checklist),
      updated_at = now()
      WHERE id = $1 AND org_id = $2 RETURNING *`,
      [cur.id, req.user.org, status, notes, handover_status, handover_docs ? JSON.stringify(handover_docs) : null, registry_checklist ? JSON.stringify(registry_checklist) : null]);
    if (status === 'cancelled' && cur.status !== 'cancelled') {
      await t.q(`UPDATE units SET status = 'available', hold_by = NULL, hold_until = NULL, updated_at = now() WHERE id = $1`, [updated.unit_id]);
      await t.q(`UPDATE commissions SET status = 'void' WHERE booking_id = $1 AND status <> 'paid'`, [updated.id]);
    } else if (['registered', 'possession'].includes(status)) {
      await t.q(`UPDATE units SET status = 'sold', updated_at = now() WHERE id = $1`, [updated.unit_id]);
    }
    return updated;
  });
  res.json(b);
}));

function validateRegistryChecklist(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail(400, 'Registry checklist must be an object');
  const booleanFields = ['pan_verified', 'aadhar_verified', 'form_26qb_tds', 'bank_noc', 'signatory_assigned', 'tds_26qb', 'stamp_duty_paid', 'deed_approved', 'slot_booked'];
  const textFields = { signatory_name: 160, appointment_time: 120, accompanying_staff: 160 };
  const allowed = new Set([...booleanFields, ...Object.keys(textFields), 'status']);
  if (Object.keys(value).some(key => !allowed.has(key))) throw fail(400, 'Registry checklist contains an unsupported field');
  for (const key of booleanFields) {
    if (value[key] !== undefined && typeof value[key] !== 'boolean') throw fail(400, `${key} must be true or false`);
  }
  for (const [key, max] of Object.entries(textFields)) {
    if (value[key] !== undefined && value[key] !== null) text(value[key], key, { max });
  }
  if (value.status !== undefined) oneOf(value.status, 'Registry checklist status', ['pending', 'ready', 'completed'], { optional: false });
}

r.post('/bookings/:id/payments', allow('admin'), h(async (req, res) => {
  const { amount, paid_on, mode, ref, milestone } = req.body || {};
  const paymentAmount = number(amount, 'Payment amount', { min: 0.01, max: 1_000_000_000, optional: false });
  const paidOn = paid_on ? dateValue(paid_on, 'Payment date', { optional: false }) : null;
  if (mode !== undefined && mode !== null && mode !== '') oneOf(mode, 'Payment mode', ['NEFT', 'RTGS', 'Cheque', 'UPI', 'Home loan disbursal'], { optional: false });
  if (ref !== undefined && (typeof ref !== 'string' || ref.length > 120)) throw fail(400, 'Payment reference must be at most 120 characters');
  if (milestone !== undefined && (typeof milestone !== 'string' || milestone.length > 100)) throw fail(400, 'Milestone must be at most 100 characters');
  const { b, p } = await tx(async t => {
    const booking = await t.one(`SELECT id, customer_id, deal_value FROM bookings WHERE id = $1 AND org_id = $2 AND status <> 'cancelled' FOR UPDATE`, [req.params.id, req.user.org]);
    if (!booking) throw fail(404, 'Booking not found');
    const paid = await t.one(`SELECT COALESCE(sum(amount),0) AS total FROM payments WHERE booking_id = $1`, [booking.id]);
    if (Number(paid.total) + paymentAmount > Number(booking.deal_value)) throw fail(400, 'Payment would exceed the remaining balance');
    const payment = await t.one(`INSERT INTO payments (booking_id, amount, paid_on, mode, ref, milestone) VALUES ($1,$2,COALESCE($3::date,current_date),$4,$5,$6) RETURNING *`, [booking.id, paymentAmount, paidOn, mode || null, ref || null, milestone || null]);
    return { b: booking, p: payment };
  });
  if (b.customer_id) await notify(req.user.org, b.customer_id, 'payment', `Payment of ${inr(paymentAmount)} received. Thank you!`, '/portal');
  res.json(p);
}));

// ---------- commissions & payroll ----------
r.get('/commissions', allow('admin', 'sales', 'broker'), h(async (req, res) => {
  const mine = req.user.role !== 'admin';
  res.json(await many(`SELECT c.*, u.name, u.role, b.deal_value, b.booking_date, un.unit_no, p.name AS project_name FROM commissions c
                       JOIN users u ON u.id = c.user_id JOIN bookings b ON b.id = c.booking_id JOIN units un ON un.id = b.unit_id JOIN projects p ON p.id = un.project_id
                       WHERE c.org_id = $1 ${mine ? 'AND c.user_id = $2' : ''} ORDER BY c.created_at DESC`, mine ? [req.user.org, req.user.id] : [req.user.org]));
}));
r.patch('/commissions/:id', allow('admin'), h(async (req, res) => {
  const { status } = req.body || {};
  if (!['pending', 'approved', 'paid', 'void'].includes(status)) throw fail(400, 'Unknown status');
  const c = await one(`UPDATE commissions SET status = $3, paid_on = CASE WHEN $3 = 'paid' THEN current_date ELSE paid_on END WHERE id = $1 AND org_id = $2 RETURNING *`, [req.params.id, req.user.org, status]);
  if (c && status === 'paid') await notify(req.user.org, c.user_id, 'payout', `${c.kind === 'broker_commission' ? 'Commission' : 'Incentive'} of ${inr(c.amount)} paid`, '/earnings');
  res.json(c);
}));

/** Monthly payroll: salary + incentives for sales, commissions for brokers. month = YYYY-MM */
r.get('/payroll', allow('admin'), h(async (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : new Date().toISOString().slice(0, 7);
  const rows = await many(
    `SELECT u.id, u.name, u.role, u.profile,
       (SELECT count(*)::int FROM bookings b WHERE (b.sold_by = u.id OR b.broker_id = u.id) AND b.status <> 'cancelled' AND to_char(b.booking_date,'YYYY-MM') = $2) AS units,
       (SELECT coalesce(sum(b.deal_value),0) FROM bookings b WHERE (b.sold_by = u.id OR b.broker_id = u.id) AND b.status <> 'cancelled' AND to_char(b.booking_date,'YYYY-MM') = $2) AS sales_value,
       (SELECT coalesce(sum(c.amount),0) FROM commissions c WHERE c.user_id = u.id AND c.status <> 'void' AND to_char(c.created_at,'YYYY-MM') = $2) AS variable,
       (SELECT coalesce(sum(c.amount),0) FROM commissions c WHERE c.user_id = u.id AND c.status = 'paid' AND to_char(c.created_at,'YYYY-MM') = $2) AS variable_paid
     FROM users u WHERE u.org_id = $1 AND u.role IN ('sales','broker') AND u.active ORDER BY u.role DESC, u.name`, [req.user.org, month]);
  res.json({ month, rows: rows.map(r => ({ ...r, salary: r.role === 'sales' ? Number(r.profile?.salary || 0) : 0, target: r.profile?.target_units || 0,
    total: (r.role === 'sales' ? Number(r.profile?.salary || 0) : 0) + Number(r.variable) })) });
}));

export default r;
