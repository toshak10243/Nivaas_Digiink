// Leads, site visits, share links, agent chats, bookings, payments, commissions, payroll
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { one, many, q, tx } from '../db.js';
import { h, allow, fail } from '../lib/auth.js';
import { costSheet, scheduleFor, inr } from '../lib/pricing.js';
import { notify, logLead } from '../services/notify.js';
import { assignLead } from '../services/routing.js';
import * as meta from '../services/meta.js';
import { config } from '../config.js';
import { resolveObjection, generateHandoverBrief, generateVisitPassportData } from '../services/gemini.js';

import { validatePreview, reservePreview, previewReply } from '../services/ai-preview.js';

const r = Router();
const STAGES = ['new', 'contacted', 'qualified', 'visit_scheduled', 'visit_done', 'negotiation', 'booked', 'lost'];

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

// ---------- leads ----------
r.get('/leads', allow('admin', 'sales', 'broker'), h(async (req, res) => {
  const s = scope(req.user);
  const vals = [req.user.org, ...s.vals];
  let extra = '';
  for (const k of ['stage', 'project_id', 'assigned_to', 'source', 'temperature']) if (req.query[k]) { vals.push(req.query[k]); extra += ` AND l.${k} = $${vals.length}`; }
  if (req.query.q) { vals.push('%' + req.query.q + '%'); extra += ` AND (l.name ILIKE $${vals.length} OR l.phone ILIKE $${vals.length})`; }
  res.json(await many(
    `SELECT l.*, a.name AS assigned_name, a.role AS assigned_role, b.name AS broker_name, p.name AS project_name, u.unit_no,
       (SELECT scheduled_at FROM site_visits v WHERE v.lead_id = l.id AND v.status IN ('scheduled','confirmed') ORDER BY scheduled_at LIMIT 1) AS next_visit
     FROM leads l LEFT JOIN users a ON a.id = l.assigned_to LEFT JOIN users b ON b.id = l.broker_id
     LEFT JOIN projects p ON p.id = l.project_id LEFT JOIN units u ON u.id = l.unit_id
     WHERE l.org_id = $1${s.sql}${extra} ORDER BY l.updated_at DESC LIMIT 500`, vals));
}));

r.post('/leads/bulk', allow('admin', 'sales', 'broker'), h(async (req, res) => {
  const { ids, action, value } = req.body || {};
  if (!Array.isArray(ids) || !ids.length || ids.length > 500 || ids.some(id => typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) throw fail(400, 'Select between 1 and 500 leads.');
  if (!['stage', 'assign', 'delete', 'complete'].includes(action)) throw fail(400, 'Unknown bulk action.');
  if (['assign', 'delete'].includes(action) && req.user.role !== 'admin') throw fail(403, 'Only admins can transfer or delete leads.');
  if (action === 'stage' && !STAGES.includes(value)) throw fail(400, 'Unknown stage.');
  const unique = [...new Set(ids)];
  await tx(async db => {
    const s = scope(req.user, 'l', 3);
    const rows = await db.many(`SELECT l.* FROM leads l WHERE l.org_id=$1 AND l.id=ANY($2::uuid[])${s.sql} ORDER BY l.id FOR UPDATE`, [req.user.org, unique, ...s.vals]);
    if (rows.length !== unique.length) throw fail(403, 'Some selected leads are no longer accessible. Refresh and try again.');
    let assignee;
    if (action === 'assign') {
      if (typeof value !== 'string' || !/^[0-9a-f-]{36}$/i.test(value)) throw fail(400, 'Select an active sales agent or broker.');
      assignee = await db.one("SELECT id,name FROM users WHERE id=$1 AND org_id=$2 AND active AND role IN ('sales','broker')", [value, req.user.org]);
      if (!assignee) throw fail(400, 'Select an active sales agent or broker.');
    }
    if (action === 'delete') {
      if (rows.some(l => l.stage === 'booked') || await db.one('SELECT id FROM bookings WHERE lead_id=ANY($1::uuid[]) LIMIT 1', [unique])) throw fail(409, 'Leads linked to bookings cannot be deleted. Deselect them first.');
      await db.q('DELETE FROM leads WHERE org_id=$1 AND id=ANY($2::uuid[])', [req.user.org, unique]);
      return;
    }
    for (const l of rows) {
      if (action === 'complete' && !l.followup_at) continue;
      if (action === 'stage') await db.q('UPDATE leads SET stage=$2,updated_at=now() WHERE id=$1', [l.id, value]);
      if (action === 'complete') await db.q('UPDATE leads SET followup_at=NULL,followup_type=NULL,followup_note=NULL,updated_at=now() WHERE id=$1', [l.id]);
      if (action === 'assign') {
        await db.q('UPDATE leads SET assigned_to=$2,assigned_at=now(),first_touch_at=NULL,updated_at=now() WHERE id=$1', [l.id, value]);
        await db.q('UPDATE site_visits SET agent_id=$2 WHERE lead_id=$1 AND status IN (\'scheduled\',\'confirmed\')', [l.id, value]);
        await db.q('UPDATE chats SET agent_id=NULL,ai_enabled=false,pending_ai_at=NULL WHERE lead_id=$1', [l.id]);
        const number = await db.one('SELECT id FROM wa_numbers WHERE org_id=$1 AND user_id=$2 ORDER BY created_at LIMIT 1', [req.user.org, value]);
        if (number) await db.q('INSERT INTO chats(org_id,lead_id,wa_number_id,agent_id) VALUES ($1,$2,$3,$4) ON CONFLICT(lead_id,wa_number_id) DO UPDATE SET agent_id=EXCLUDED.agent_id', [req.user.org,l.id,number.id,value]);
        await db.q("INSERT INTO notifications(org_id,user_id,kind,body,link) VALUES ($1,$2,'lead_assigned',$3,$4)", [req.user.org, value, `Lead assigned: ${l.name || l.phone}`, `/leads/${l.id}`]);
      }
      await db.q('INSERT INTO lead_events(lead_id,actor_id,kind,body) VALUES ($1,$2,$3,$4)', [l.id, req.user.id, action === 'assign' ? 'assigned' : action === 'complete' ? 'followup' : 'stage', action === 'assign' ? `Bulk assigned to ${assignee.name}` : action === 'complete' ? 'Follow-up marked completed' : `Stage: ${l.stage} → ${value}`]);
    }
  });
  res.json({ ok: true, count: unique.length });
}));

r.post('/leads/bulk-message', allow('admin', 'sales'), h(async (req, res) => {
  const { ids, text } = req.body || {};
  if (!Array.isArray(ids) || !ids.length || ids.length > 50 || ids.some(id => typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id))) throw fail(400, 'Select up to 50 leads to message.');
  if (typeof text !== 'string' || !text.trim() || text.length > 4000) throw fail(400, 'Enter a message of up to 4000 characters.');
  const s = scope(req.user, 'l', 3), unique = [...new Set(ids)];
  const leads = await many(`SELECT l.* FROM leads l WHERE l.org_id=$1 AND l.id=ANY($2::uuid[])${s.sql}`, [req.user.org, unique, ...s.vals]);
  if (leads.length !== unique.length) throw fail(403, 'Some selected leads are no longer accessible.');
  const sent = [], failed = [];
  for (const lead of leads) {
    const c = await one(`SELECT c.*,w.phone_number_id,w.access_token FROM chats c JOIN wa_numbers w ON w.id=c.wa_number_id WHERE c.lead_id=$1 AND c.org_id=$2 AND c.last_customer_at > now()-interval '24 hours' ${req.user.role === 'admin' ? '' : 'AND c.agent_id=$3'} ORDER BY c.last_customer_at DESC LIMIT 1`, req.user.role === 'admin' ? [lead.id, req.user.org] : [lead.id, req.user.org, req.user.id]);
    if (!c) { failed.push({ id: lead.id, reason: 'No connected WhatsApp conversation with a customer reply in the last 24 hours.' }); continue; }
    try { await meta.sendText(c, meta.normPhone(lead.phone), text.trim()); }
    catch { failed.push({ id: lead.id, reason: 'WhatsApp rejected the message. Check the connection before retrying.' }); continue; }
    await q("INSERT INTO chat_messages(chat_id,sender,body) VALUES ($1,'agent',$2)", [c.id, text.trim()]);
    await q('UPDATE chats SET last_agent_at=now(),pending_ai_at=NULL WHERE id=$1', [c.id]);
    sent.push(lead.id);
  }
  res.json({ sent, failed });
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
  res.json({ ...l, events, visits, chats, shares, assigned, broker, project, unit });
}));

/** Manual lead, walk-in, or a broker registering their client (lead protection: first registration wins). */
r.post('/leads', allow('admin', 'sales', 'broker'), h(async (req, res) => {
  const b = req.body || {};
  const phone = meta.normPhone(b.phone);
  if (!b.name || phone.length < 10) throw fail(400, 'Name and a valid phone number are required');
  const dupe = await one(`SELECT l.id, l.broker_id, l.assigned_to, u.name AS owner FROM leads l LEFT JOIN users u ON u.id = COALESCE(l.broker_id, l.assigned_to)
                          WHERE l.org_id = $1 AND l.phone = $2 AND l.stage <> 'lost'`, [req.user.org, phone]);
  if (dupe) throw fail(409, `This customer is already registered${dupe.owner ? ' with ' + dupe.owner : ''}.`);
  const isBroker = req.user.role === 'broker';
  const lead = await one(
    `INSERT INTO leads (org_id, project_id, name, phone, email, source, budget, config_pref, purpose, timeline, notes, broker_id, assigned_to, assigned_at, first_touch_at, stage, followup_at, followup_type, followup_note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, CASE WHEN $13::uuid IS NULL THEN NULL ELSE now() END, CASE WHEN $13::uuid IS NULL THEN NULL ELSE now() END, $14, $15, $16, $17) RETURNING *`,
    [req.user.org, b.project_id || null, b.name, phone, b.email || null, isBroker ? 'broker' : (b.source || 'manual'), b.budget, b.config_pref, b.purpose, b.timeline, b.notes,
      isBroker ? req.user.id : null, req.user.role === 'admin' ? (b.assigned_to || null) : req.user.id, b.stage && STAGES.includes(b.stage) ? b.stage : 'contacted',
      b.followup_at || null, b.followup_type || 'call', b.followup_note || null]);
  await logLead(lead.id, req.user.id, 'created', isBroker ? `Registered by broker ${req.user.name}` : `Added by ${req.user.name}`);
  if (lead.followup_at) {
    const fDate = new Date(lead.followup_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
    await logLead(lead.id, req.user.id, 'followup', `Follow-up (${lead.followup_type}) scheduled for ${fDate}${lead.followup_note ? ': ' + lead.followup_note : ''}`);
  }
  if (isBroker) await notify(req.user.org, null, 'lead', `Broker ${req.user.name} registered ${b.name}`, `/leads/${lead.id}`);
  if (req.user.role === 'admin' && !lead.assigned_to && b.auto_assign) await assignLead(lead.id, { actorId: req.user.id });
  res.json(lead);
}));

r.patch('/leads/:id', allow('admin', 'sales', 'broker'), h(async (req, res) => {
  const l = await leadFor(req.user, req.params.id);
  const b = req.body || {};
  if (b.stage && !STAGES.includes(b.stage)) throw fail(400, 'Unknown stage');
  const preferences = ['1 BHK','2 BHK','3 BHK','4 BHK','Parking','Home loan','Ready to move'];
  const checklist = ['call_done','visit_done','documents_sent','pan_received','aadhaar_received','booking_form','agreement_signed'];
  if (b.preferences !== undefined && (!Array.isArray(b.preferences) || b.preferences.length > preferences.length || b.preferences.some(v => !preferences.includes(v)))) throw fail(400, 'Invalid preferences');
  if (b.checklist !== undefined && (!b.checklist || Array.isArray(b.checklist) || typeof b.checklist !== 'object' || Object.entries(b.checklist).some(([k,v]) => !checklist.includes(k) || typeof v !== 'boolean'))) throw fail(400, 'Invalid checklist');
  const followupAt = b.followup_at !== undefined ? (b.followup_at ? new Date(b.followup_at).toISOString() : null) : l.followup_at;
  const followupType = b.followup_type !== undefined ? b.followup_type : l.followup_type;
  const followupNote = b.followup_note !== undefined ? b.followup_note : l.followup_note;

  const row = await one(
    `UPDATE leads SET name = COALESCE($2,name), email = COALESCE($3,email), budget = COALESCE($4,budget), config_pref = COALESCE($5,config_pref),
       purpose = COALESCE($6,purpose), timeline = COALESCE($7,timeline), notes = COALESCE($8,notes), stage = COALESCE($9,stage),
       temperature = COALESCE($10,temperature), project_id = COALESCE($11,project_id), unit_id = COALESCE($12,unit_id), lost_reason = COALESCE($13,lost_reason),
       followup_at = $14, followup_type = $15, followup_note = $16,
       preferences = COALESCE($18::jsonb,preferences), checklist = COALESCE($19::jsonb,checklist),
       first_touch_at = COALESCE(first_touch_at, CASE WHEN assigned_to = $17 THEN now() END), updated_at = now()
     WHERE id = $1 RETURNING *`,
    [l.id, b.name, b.email, b.budget, b.config_pref, b.purpose, b.timeline, b.notes, b.stage, b.temperature, b.project_id, b.unit_id, b.lost_reason,
     followupAt, followupType, followupNote, req.user.id, b.preferences === undefined ? null : JSON.stringify(b.preferences), b.checklist === undefined ? null : JSON.stringify(b.checklist)]);

  if (b.checklist !== undefined) await logLead(l.id, req.user.id, 'note', `Checklist updated: ${Object.entries(b.checklist).filter(([k,v]) => l.checklist?.[k] !== v).map(([k,v]) => `${k.replaceAll('_',' ')}: ${v ? 'done' : 'pending'}`).join(', ')}`);

  if (b.stage && b.stage !== l.stage) await logLead(l.id, req.user.id, 'stage', `Stage: ${l.stage.replace('_', ' ')} → ${b.stage.replace('_', ' ')}${b.lost_reason ? ` (${b.lost_reason})` : ''}`);

  if (b.followup_at !== undefined) {
    if (b.followup_at) {
      const fDate = new Date(b.followup_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
      await logLead(l.id, req.user.id, 'followup', `Follow-up (${b.followup_type || 'call'}) scheduled for ${fDate}${b.followup_note ? ': ' + b.followup_note : ''}`);
    } else {
      await logLead(l.id, req.user.id, 'followup', `Follow-up marked completed`);
    }
  }

  res.json(row);
}));

r.post('/leads/:id/assign', allow('admin'), h(async (req, res) => {
  await leadFor(req.user, req.params.id);
  const who = await assignLead(req.params.id, { actorId: req.user.id, userId: req.body?.user_id || null, reason: req.body?.user_id ? 'manual' : 'auto' });
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
  res.json(await many(`SELECT v.*, l.name, l.phone, l.config_pref, p.name AS project_name, p.map_url, p.location, a.name AS agent FROM site_visits v JOIN leads l ON l.id = v.lead_id
                       LEFT JOIN projects p ON p.id = v.project_id LEFT JOIN users a ON a.id = v.agent_id
                       WHERE v.org_id = $1${s.sql} AND v.scheduled_at > now() - interval '60 days' ORDER BY v.scheduled_at DESC`, [req.user.org, ...s.vals]));
}));

r.post('/visits', allow('admin', 'sales', 'broker'), h(async (req, res) => {
  const { lead_id, project_id, scheduled_at, visitors_count = 1, transport = 'Self', pickup_address } = req.body || {};
  if (!lead_id) throw fail(400, 'Select a lead');
  if (!scheduled_at || isNaN(new Date(scheduled_at))) throw fail(400, 'Pick date and time');
  const l = await leadFor(req.user, lead_id);
  const v = await one(
    `INSERT INTO site_visits (org_id, lead_id, project_id, agent_id, scheduled_at, visitors_count, transport, pickup_address)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.user.org, l.id, project_id || l.project_id, l.assigned_to || req.user.id, scheduled_at, Number(visitors_count) || 1, transport, pickup_address || null]);

  await q(`UPDATE leads SET stage = 'visit_scheduled', first_touch_at = COALESCE(first_touch_at, now()) WHERE id = $1 AND stage IN ('new','contacted','qualified')`, [l.id]);
  const when = new Date(scheduled_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
  await logLead(l.id, req.user.id, 'visit', `Site visit scheduled for ${when} (${visitors_count} visitors · ${transport})`);
  if (l.assigned_to && l.assigned_to !== req.user.id) await notify(req.user.org, l.assigned_to, 'visit', `Site visit booked for ${l.name}`, `/leads/${l.id}`);
  res.json(v);
}));

r.post('/leads/:id/visits', allow('admin', 'sales', 'broker'), h(async (req, res) => {
  const l = await leadFor(req.user, req.params.id);
  const { scheduled_at, visitors_count = 1, transport = 'Self', pickup_address } = req.body || {};
  if (!scheduled_at || isNaN(new Date(scheduled_at))) throw fail(400, 'Pick a date and time');
  const v = await one(
    `INSERT INTO site_visits (org_id, lead_id, project_id, agent_id, scheduled_at, visitors_count, transport, pickup_address)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.user.org, l.id, l.project_id, l.assigned_to || req.user.id, scheduled_at, Number(visitors_count) || 1, transport, pickup_address || null]);
  await q(`UPDATE leads SET stage = 'visit_scheduled', first_touch_at = COALESCE(first_touch_at, now()) WHERE id = $1 AND stage IN ('new','contacted','qualified')`, [l.id]);
  const when = new Date(scheduled_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
  await logLead(l.id, req.user.id, 'visit', `Site visit scheduled for ${when} (${visitors_count} visitors · ${transport})`);
  if (l.assigned_to && l.assigned_to !== req.user.id) await notify(req.user.org, l.assigned_to, 'visit', `Site visit booked for ${l.name}`, `/leads/${l.id}`);
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
  await logLead(v.lead_id, req.user.id, 'visit', `AI Site Visit Passport #${passport.passportId} created & verified`);
  res.json({ passport, ...passport });
}));

// Feature 8: Smart Site Visit Route & Staff Allocation
r.get('/visits/allocation-suggestions', allow('admin', 'sales'), h(async (req, res) => {
  const { date = new Date().toISOString().slice(0, 10) } = req.query;
  const agents = await many(
    `SELECT u.id, u.name, u.role, u.profile,
       (SELECT count(*)::int FROM site_visits v WHERE v.agent_id = u.id AND v.status IN ('scheduled','confirmed') AND date_trunc('day', v.scheduled_at) = $2::date) AS today_visits
     FROM users u WHERE u.org_id = $1 AND u.role = 'sales' AND u.active ORDER BY today_visits ASC, u.name`,
    [req.user.org, date]);

  const allVisits = await many(
    `SELECT v.id, v.scheduled_at, v.agent_id, v.status, u.name AS agent_name
     FROM site_visits v LEFT JOIN users u ON u.id = v.agent_id
     WHERE v.org_id = $1 AND date_trunc('day', v.scheduled_at) = $2::date AND v.status IN ('scheduled','confirmed')`,
    [req.user.org, date]);

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
    date,
    agents,
    conflicts,
    suggestedAgent: agents.find(a => (a.profile?.availability || 'available') === 'available') || agents[0],
  });
}));

r.patch('/visits/:id', allow('admin', 'sales', 'broker'), h(async (req, res) => {
  const { status, feedback, rating, interested_unit, reschedule_at } = req.body || {};
  const cur = await one(`SELECT * FROM site_visits WHERE id = $1 AND org_id = $2`, [req.params.id, req.user.org]);
  if (!cur) throw fail(404, 'Visit not found');

  let newTime = cur.scheduled_at;
  if (status === 'rescheduled' && reschedule_at && !isNaN(new Date(reschedule_at))) {
    newTime = new Date(reschedule_at).toISOString();
  }

  const v = await one(
    `UPDATE site_visits SET status = COALESCE($3,status), feedback = COALESCE($4,feedback),
       rating = COALESCE($5,rating), interested_unit = COALESCE($6,interested_unit),
       scheduled_at = $7 WHERE id = $1 AND org_id = $2 RETURNING *`,
    [cur.id, req.user.org, status, feedback, rating ? Number(rating) : null, interested_unit, newTime]);

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

  res.json(v);
}));

// ---------- share links ----------
r.post('/share', allow('admin', 'sales', 'broker'), h(async (req, res) => {
  const { project_id, unit_id, lead_id } = req.body || {};
  const p = await one(`SELECT id FROM projects WHERE id = $1 AND org_id = $2`, [project_id, req.user.org]);
  if (!p) throw fail(404, 'Project not found');
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
       (SELECT created_at FROM chat_messages m WHERE m.chat_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_at
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

  let num = await one(`SELECT * FROM wa_numbers WHERE org_id = $1 AND user_id = $2`, [req.user.org, req.user.id]);
  if (!num) num = await one(`SELECT * FROM wa_numbers WHERE org_id = $1 ORDER BY user_id NULLS LAST LIMIT 1`, [req.user.org]);
  if (!num) throw fail(409, 'No WhatsApp number connected yet. Connect one in Settings → Integrations.');

  let chat = await one(`SELECT * FROM chats WHERE org_id = $1 AND lead_id = $2 AND wa_number_id = $3`, [req.user.org, lead.id, num.id]);
  if (!chat) {
    chat = await one(
      `INSERT INTO chats (org_id, lead_id, wa_number_id, agent_id, last_customer_at)
       VALUES ($1,$2,$3,$4,now()) RETURNING *`,
      [req.user.org, lead.id, num.id, req.user.id]);
  }

  if (initial_message && String(initial_message).trim()) {
    const text = String(initial_message).trim();
    try {
      if (config.meta.introTemplate) await meta.sendTemplate(num, meta.normPhone(lead.phone), [lead.name || 'ji', req.user.name, 'our project']);
      else await meta.sendText(num, meta.normPhone(lead.phone), text);
    } catch (e) {
      console.warn('[wa send]', e.message);
    }
    await one(`INSERT INTO chat_messages (chat_id, sender, body) VALUES ($1,'agent',$2) RETURNING *`, [chat.id, text]);
    await q(`UPDATE chats SET last_agent_at = now() WHERE id = $1`, [chat.id]);
  }

  res.json({ ...chat, name: lead.name, phone: lead.phone });
}));
async function chatFor(user, id) {
  const c = await one(`SELECT c.*, w.phone_number_id, w.access_token, w.display, l.phone, l.name, l.id AS lead_id FROM chats c JOIN wa_numbers w ON w.id = c.wa_number_id JOIN leads l ON l.id = c.lead_id
                       WHERE c.id = $1 AND c.org_id = $2 ${user.role === 'admin' ? '' : 'AND c.agent_id = $3'}`, user.role === 'admin' ? [id, user.org] : [id, user.org, user.id]);
  if (!c) throw fail(404, 'Chat not found');
  return c;
}
r.get('/chats/:id', allow('admin', 'sales'), h(async (req, res) => {
  const c = await chatFor(req.user, req.params.id);
  const { access_token, ...safe } = c;
  res.json({ ...safe, messages: await many(`SELECT * FROM chat_messages WHERE chat_id = $1 ORDER BY created_at`, [c.id]) });
}));
r.post('/chats/:id/ai-preview', allow('admin','sales'), h(async(req,res)=>{
  const chat=await chatFor(req.user,req.params.id);
  const input=validatePreview(req.body);
  const release=reservePreview(req.user.org+':'+req.user.id);
  try { res.json(await previewReply(chat,input)); }
  catch(error) {
    if(error.status) throw error;
    console.warn('[ai-preview] Provider unavailable',error.name);
    throw fail(503,'AI could not reply right now. Check the configured AI provider or try again.');
  } finally { release(); }
}));
r.post('/chats/:id/messages', allow('admin', 'sales'), h(async (req, res) => {
  const c = await chatFor(req.user, req.params.id);
  const text = String(req.body?.text || '').trim();
  if (!text) throw fail(400, 'Message is empty');
  if (!c.last_customer_at || Date.now() - new Date(c.last_customer_at) > 24 * 3600e3) throw fail(409, 'WhatsApp allows free messages only within 24 hours of the customer’s last message. Call them, or wait for them to reply.');
  try { await meta.sendText(c, meta.normPhone(c.phone), text); }
  catch (e) { throw fail(502, `WhatsApp could not send this message (${e.message}). Add this number's real Phone number ID and access token in Settings → LeadSathi & WhatsApp.`); }
  const m = await one(`INSERT INTO chat_messages (chat_id, sender, body) VALUES ($1,'agent',$2) RETURNING *`, [c.id, text]);
  await q(`UPDATE chats SET last_agent_at = now(), pending_ai_at = NULL WHERE id = $1`, [c.id]);
  await q(`UPDATE leads SET first_touch_at = COALESCE(first_touch_at, now()), stage = CASE WHEN stage = 'new' THEN 'contacted' ELSE stage END WHERE id = $1`, [c.lead_id]);
  res.json(m);
}));
r.patch('/chats/:id', allow('admin', 'sales'), h(async (req, res) => {
  const c = await chatFor(req.user, req.params.id);
  const on = !!req.body?.ai_enabled;
  await q(`UPDATE chats SET ai_enabled = $2, pending_ai_at = NULL WHERE id = $1`, [c.id, on]);
  await q(`INSERT INTO chat_messages (chat_id, sender, body) VALUES ($1,'system',$2)`, [c.id, on ? 'AI twin is back on for this chat' : `${req.user.name} took over this chat`]);
  res.sendStatus(204);
}));

// ---------- bookings ----------
r.get('/bookings', h(async (req, res) => {
  const { role, id, org } = req.user;
  const where = role === 'admin' ? '' : role === 'sales' ? 'AND b.sold_by = $2' : role === 'broker' ? 'AND b.broker_id = $2' : role === 'customer' ? 'AND b.customer_id = $2' : 'AND false';
  res.json(await many(
    `SELECT b.*, u.unit_no, p.name AS project_name, c.name AS customer_name, c.phone AS customer_phone, s.name AS sold_by_name, br.name AS broker_name,
       (SELECT coalesce(sum(amount),0) FROM payments x WHERE x.booking_id = b.id) AS paid
     FROM bookings b JOIN units u ON u.id = b.unit_id JOIN projects p ON p.id = u.project_id
     LEFT JOIN users c ON c.id = b.customer_id LEFT JOIN users s ON s.id = b.sold_by LEFT JOIN users br ON br.id = b.broker_id
     WHERE b.org_id = $1 ${where} ORDER BY b.created_at DESC`, role === 'admin' ? [org] : [org, id]));
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
  b.commissions = req.user.role === 'customer' ? [] : await many(`SELECT c.*, u.name FROM commissions c JOIN users u ON u.id = c.user_id WHERE c.booking_id = $1 ${req.user.role === 'admin' ? '' : 'AND c.user_id = $2'}`, req.user.role === 'admin' ? [b.id] : [b.id, req.user.id]);
  res.json(b);
}));

/** Book a unit. Creates the customer login, payment schedule, broker commission and sales incentive in one go. */
r.post('/bookings', allow('admin', 'sales'), h(async (req, res) => {
  const b = req.body || {};
  const unit = await one(`SELECT u.*, p.org_id, p.rate_sqft, p.charges, p.payment_plan, p.name AS project_name FROM units u JOIN projects p ON p.id = u.project_id WHERE u.id = $1 AND p.org_id = $2`, [b.unit_id, req.user.org]);
  if (!unit) throw fail(404, 'Unit not found');
  if (!['available', 'hold'].includes(unit.status)) throw fail(409, `${unit.unit_no} is already ${unit.status}`);
  if (unit.status === 'hold' && unit.hold_by !== req.user.id && req.user.role !== 'admin') throw fail(409, `${unit.unit_no} is on hold by someone else`);
  const type = await one(`SELECT * FROM unit_types WHERE id = $1`, [unit.unit_type_id]);
  const list = costSheet(unit, type, unit).total;
  const discount = Math.max(0, Number(b.discount || 0));
  const deal = Math.round(list - discount);
  const lead = b.lead_id ? await one(`SELECT * FROM leads WHERE id = $1 AND org_id = $2`, [b.lead_id, req.user.org]) : null;
  const custName = b.customer_name || lead?.name, custPhone = meta.normPhone(b.customer_phone || lead?.phone), custEmail = (b.customer_email || lead?.email || '').trim();
  if (!custName || !custEmail) throw fail(400, 'Customer name and email are needed (the email becomes their portal login)');
  const soldBy = req.user.role === 'sales' ? req.user.id : (b.sold_by || lead?.assigned_to || null);
  const brokerId = b.broker_id || lead?.broker_id || null;
  const temp = crypto.randomBytes(5).toString('base64url');

  const out = await tx(async t => {
    let cust = await t.one(`SELECT id FROM users WHERE org_id = $1 AND lower(email) = lower($2)`, [req.user.org, custEmail]);
    let newLogin = false;
    if (!cust) { cust = await t.one(`INSERT INTO users (org_id, role, name, email, phone, password_hash) VALUES ($1,'customer',$2,$3,$4,$5) RETURNING id`, [req.user.org, custName, custEmail, custPhone, await bcrypt.hash(temp, 10)]); newLogin = true; }
    const booking = await t.one(
      `INSERT INTO bookings (org_id, unit_id, lead_id, customer_id, sold_by, broker_id, deal_value, discount, booking_amount, booking_date, schedule, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, COALESCE($10::date, current_date), $11, $12) RETURNING *`,
      [req.user.org, unit.id, lead?.id || null, cust.id, soldBy, brokerId, deal, discount, Number(b.booking_amount || 0), b.booking_date || null, JSON.stringify(scheduleFor(unit, deal)), b.notes || null]);
    await t.q(`UPDATE units SET status = 'booked', hold_by = NULL, hold_until = NULL, updated_at = now() WHERE id = $1`, [unit.id]);
    if (Number(b.booking_amount) > 0) await t.q(`INSERT INTO payments (booking_id, amount, mode, ref, milestone) VALUES ($1,$2,$3,$4,'Booking amount')`, [booking.id, b.booking_amount, b.payment_mode || null, b.payment_ref || null]);
    if (lead) await t.q(`UPDATE leads SET stage = 'booked', unit_id = $2, updated_at = now() WHERE id = $1`, [lead.id, unit.id]);
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
  if (lead) await logLead(lead.id, req.user.id, 'stage', `Booked ${unit.unit_no} for ${inr(deal)}`);
  await notify(req.user.org, null, 'booking', `${unit.unit_no} (${unit.project_name}) booked for ${inr(deal)} by ${req.user.name}`, `/bookings/${out.booking.id}`);
  if (brokerId && brokerId !== req.user.id) await notify(req.user.org, brokerId, 'booking', `Your client ${custName} booked ${unit.unit_no}. Commission added.`, `/bookings/${out.booking.id}`);
  res.json({ ...out.booking, customer_login: out.newLogin ? { email: custEmail, temp_password: temp } : null });
}));

r.patch('/bookings/:id', allow('admin', 'sales'), h(async (req, res) => {
  const { status, notes, handover_status, handover_docs, registry_checklist } = req.body || {};
  const b = await one(`UPDATE bookings SET
    status = COALESCE($3, status),
    notes = COALESCE($4, notes),
    handover_status = COALESCE($5, handover_status),
    handover_docs = COALESCE($6, handover_docs),
    registry_checklist = COALESCE($7, registry_checklist),
    updated_at = now()
    WHERE id = $1 AND org_id = $2 RETURNING *`,
    [req.params.id, req.user.org, status, notes, handover_status, handover_docs ? JSON.stringify(handover_docs) : null, registry_checklist ? JSON.stringify(registry_checklist) : null]);
  if (!b) throw fail(404, 'Booking not found');
  if (status === 'cancelled') {
    await q(`UPDATE units SET status = 'available', updated_at = now() WHERE id = $1`, [b.unit_id]);
    await q(`UPDATE commissions SET status = 'void' WHERE booking_id = $1 AND status <> 'paid'`, [b.id]);
  } else if (['registered', 'possession'].includes(status)) await q(`UPDATE units SET status = 'sold', updated_at = now() WHERE id = $1`, [b.unit_id]);
  res.json(b);
}));

r.post('/bookings/:id/payments', allow('admin'), h(async (req, res) => {
  const { amount, paid_on, mode, ref, milestone } = req.body || {};
  if (!(Number(amount) > 0)) throw fail(400, 'Enter the amount received');
  const b = await one(`SELECT id, customer_id FROM bookings WHERE id = $1 AND org_id = $2`, [req.params.id, req.user.org]);
  if (!b) throw fail(404, 'Booking not found');
  const p = await one(`INSERT INTO payments (booking_id, amount, paid_on, mode, ref, milestone) VALUES ($1,$2,COALESCE($3::date,current_date),$4,$5,$6) RETURNING *`, [b.id, amount, paid_on || null, mode, ref, milestone]);
  if (b.customer_id) await notify(req.user.org, b.customer_id, 'payment', `Payment of ${inr(amount)} received. Thank you!`, '/portal');
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
