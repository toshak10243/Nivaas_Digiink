// No login needed: the shareable project/flat page, its enquiry form, and the LeadSathi bridge.
import { Router } from 'express';
import { one, many, q } from '../db.js';
import { h, fail } from '../lib/auth.js';
import { costSheet } from '../lib/pricing.js';
import { settingsOf } from '../settings.js';
import { notify, logLead } from '../services/notify.js';
import { assignLead } from '../services/routing.js';
import { normPhone } from '../services/meta.js';
import { rateLimit } from '../lib/rate-limit.js';
import { phone as validPhone, email as validEmail, futureDateTime, text, uuid } from '../lib/validate.js';

const r = Router();

function validateShareToken(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{16}$/i.test(value)) throw fail(400, 'Share token is invalid');
}

// ---------- /p/:token — what the customer sees when they open a shared link ----------
r.get('/p/:token', h(async (req, res) => {
  validateShareToken(req.params.token);
  const link = await one(`SELECT * FROM share_links WHERE token = $1`, [req.params.token]);
  if (!link) throw fail(404, 'This link has expired or is not valid');
  const org = await one(`SELECT name, logo_url, phone, address, rera_promoter, settings FROM orgs WHERE id = $1`, [link.org_id]);
  const p = await one(`SELECT id, name, tagline, description, location, city, map_url, rera_no, status, possession, rate_sqft, charges, payment_plan, amenities, highlights, cover_url, brochure_url
                       FROM projects WHERE id = $1`, [link.project_id]);
  const types = await many(`SELECT * FROM unit_types WHERE project_id = $1 ORDER BY bhk, super_sqft`, [p.id]);
  const media = await many(`SELECT kind, url, title, unit_type_id FROM media WHERE project_id = $1 ORDER BY sort, created_at`, [p.id]);
  const units = await many(`SELECT u.id, u.unit_no, u.floor, u.facing, u.status, u.plc_pct, u.price_override, u.unit_type_id, tw.name AS tower FROM units u LEFT JOIN towers tw ON tw.id = u.tower_id
                            WHERE u.project_id = $1 ORDER BY tw.name, u.floor, u.unit_no`, [p.id]);
  const byType = Object.fromEntries(types.map(t => [t.id, t]));
  const priced = units.map(u => ({ ...u, status: u.status === 'available' ? 'available' : 'unavailable', price_override: undefined,
    cost: byType[u.unit_type_id] ? costSheet(p, byType[u.unit_type_id], u) : null }));
  const sender = await one(`SELECT u.name, u.role, u.phone, u.profile->>'firm' AS firm, w.display AS whatsapp FROM users u LEFT JOIN wa_numbers w ON w.user_id = u.id WHERE u.id = $1`, [link.created_by]);

  await q(`UPDATE share_links SET views = views + 1, last_viewed = now() WHERE id = $1`, [link.id]);
  if (link.views === 0 || !link.last_viewed || Date.now() - new Date(link.last_viewed) > 30 * 60 * 1000) {
    const unit = link.unit_id ? units.find(u => u.id === link.unit_id)?.unit_no : null;
    const lead = link.lead_id ? await one(`SELECT name FROM leads WHERE id = $1`, [link.lead_id]) : null;
    await notify(link.org_id, link.created_by, 'share_view', `${lead?.name || 'Someone'} opened your ${unit || p.name} link`, link.lead_id ? `/leads/${link.lead_id}` : '/share');
    if (link.lead_id) await logLead(link.lead_id, null, 'share_view', `Opened the ${unit || p.name} link`);
  }
  res.json({
    org: { name: org.name, logo_url: org.logo_url, phone: org.phone, address: org.address, rera_promoter: org.rera_promoter },
    project: { ...p, charges: p.charges }, unit_types: types, media, units: priced,
    unit_id: link.unit_id, agent: sender ? { name: sender.name, role: sender.role, firm: sender.firm, phone: sender.whatsapp || sender.phone } : null,
    emi: settingsOf(org).emi,
  });
}));

r.post('/p/:token/enquire', rateLimit({ windowMs: 10 * 60_000, limit: 8, key: req => `enquire:${req.ip}:${req.params.token}`, message: 'Too many enquiries from this connection. Try again in a few minutes.' }), h(async (req, res) => {
  validateShareToken(req.params.token);
  const link = await one(`SELECT s.*, u.role FROM share_links s JOIN users u ON u.id = s.created_by WHERE s.token = $1`, [req.params.token]);
  if (!link) throw fail(404, 'This link has expired');
  const { name, phone, message, unit_no, visit } = req.body || {};
  const cleanName = text(name, 'Name', { optional: false, max: 160 });
  const ph = normPhone(validPhone(phone, 'Mobile number', { optional: false }));
  if (ph.length < 10) throw fail(400, 'Please enter a valid mobile number');
  const cleanMessage = message === undefined || message === null || message === '' ? null : text(message, 'Message', { max: 2000 });
  const cleanUnitNo = unit_no ? text(unit_no, 'Unit number', { optional: false, max: 80 }) : null;
  const cleanVisit = visit ? text(visit, 'Visit preference', { optional: false, max: 120 }) : null;
  const unit = cleanUnitNo ? await one(`SELECT id FROM units WHERE project_id = $1 AND unit_no = $2`, [link.project_id, cleanUnitNo]) : null;
  if (cleanUnitNo && !unit) throw fail(400, 'Selected unit does not belong to this project');
  let lead = link.lead_id ? await one(`SELECT * FROM leads WHERE id = $1`, [link.lead_id]) : await one(`SELECT * FROM leads WHERE org_id = $1 AND phone = $2 AND stage <> 'lost'`, [link.org_id, ph]);
  if (!lead) {
    lead = await one(`INSERT INTO leads (org_id, project_id, name, phone, source, source_ref, unit_id, assigned_to, assigned_at, broker_id, stage, notes, temperature)
                      VALUES ($1,$2,$3,$4,'share_link',$5,$6,$7,now(),$8,'qualified',$9,'hot') RETURNING *`,
      [link.org_id, link.project_id, cleanName, ph, link.token, unit?.id || null, link.role === 'admin' ? null : link.created_by, link.role === 'broker' ? link.created_by : null, cleanMessage]);
    await logLead(lead.id, null, 'created', `Enquired from a shared link${cleanUnitNo ? ' for ' + cleanUnitNo : ''}`);
    if (!lead.assigned_to) await assignLead(lead.id);
  } else {
    await q(`UPDATE leads SET unit_id = COALESCE($2, unit_id), temperature = 'hot', updated_at = now() WHERE id = $1`, [lead.id, unit?.id || null]);
    await logLead(lead.id, null, 'note', `Enquired again from the link${cleanUnitNo ? ' about ' + cleanUnitNo : ''}${cleanMessage ? ': ' + cleanMessage : ''}`);
  }
  if (cleanVisit) await logLead(lead.id, null, 'note', `Wants a site visit: ${cleanVisit}`);
  await notify(link.org_id, lead.assigned_to || link.created_by, 'lead', `${cleanName} enquired${cleanUnitNo ? ' about ' + cleanUnitNo : ''} from your link. Call ${ph}`, `/leads/${lead.id}`);
  res.json({ ok: true });
}));

// ---------- LeadSathi → Nivaas ----------
// In LeadSathi: Settings → Integrations → Webhook URL = the URL shown in Nivaas → Integrations.
// LeadSathi posts {event: 'new_lead'|'hot_lead', lead: {id, name, phone, tag, summary, lead_fields, channel_type}}
r.post('/bridge/leadsathi/:orgId', h(async (req, res) => {
  uuid(req.params.orgId, 'Organization ID');
  const org = await one(`SELECT * FROM orgs WHERE id = $1`, [req.params.orgId]);
  if (!org || (req.query.secret || req.get('x-nivaas-secret')) !== org.bridge_secret) throw fail(401, 'Bad secret');
  const { event, lead: L = {} } = req.body || {};
  if (!['new_lead', 'hot_lead'].includes(event)) throw fail(400, 'Unknown LeadSathi event');
  if (!L || typeof L !== 'object' || Array.isArray(L)) throw fail(400, 'Lead data must be an object');
  const f = L.lead_fields || {};
  if (!f || typeof f !== 'object' || Array.isArray(f)) throw fail(400, 'Lead fields must be an object');
  const rawPhone = L.phone || f.phone;
  const phone = rawPhone ? normPhone(validPhone(rawPhone, 'Lead phone', { optional: false })) : '';
  if (!phone) return res.json({ ok: true, skipped: 'no phone yet' });
  if (phone.length < 10) throw fail(400, 'Lead phone is invalid');
  const leadName = L.name === undefined || L.name === null || L.name === '' ? null : text(L.name, 'Lead name', { max: 160 });
  const summary = L.summary === undefined || L.summary === null || L.summary === '' ? null : text(L.summary, 'Lead summary', { max: 4000 });
  const leadEmail = f.email === undefined || f.email === null || f.email === '' ? null : validEmail(f.email, 'Lead email', { optional: false });
  const leadBudget = optionalBridgeText(f.budget, 'Lead budget', 100);
  const leadConfig = optionalBridgeText(f.config || f.configuration, 'Configuration preference', 120);
  const leadPurpose = optionalBridgeText(f.purpose, 'Purpose', 80);
  const leadTimeline = optionalBridgeText(f.timeline, 'Timeline', 100);
  const leadProject = optionalBridgeText(f.project, 'Project hint', 160);
  const leadLocation = optionalBridgeText(f.location, 'Location hint', 160);
  const reference = L.id ? text(L.id, 'LeadSathi reference', { max: 200 }) : null;
  const channel = L.channel_type ? text(L.channel_type, 'Channel type', { max: 80 }) : 'chat';
  const tag = L.tag ? text(L.tag, 'Lead tag', { max: 60 }).toLowerCase() : '';
  const visitText = optionalBridgeText(f.visit, 'Visit preference', 160);
  const visitAt = visitText && /^\d{4}-\d{2}-\d{2}T/.test(visitText) ? futureDateTime(visitText, 'Requested visit time') : null;
  const projects = await many(`SELECT id, name FROM projects WHERE org_id = $1`, [org.id]);
  const hint = `${leadProject || ''} ${leadLocation || ''} ${summary || ''}`.toLowerCase();
  const project = projects.find(p => hint.includes(p.name.toLowerCase().split(' ')[0])) || projects[0];
  const temp = tag === 'hot' ? 'hot' : tag === 'cold' ? 'cold' : 'warm';
  const qualified = event === 'hot_lead' || tag === 'hot';
  let lead = await one(`SELECT * FROM leads WHERE org_id = $1 AND phone = $2 AND stage <> 'lost'`, [org.id, phone]);
  if (!lead) {
    lead = await one(`INSERT INTO leads (org_id, project_id, name, phone, email, source, source_ref, stage, temperature, budget, config_pref, purpose, timeline, ai_summary)
                      VALUES ($1,$2,$3,$4,$5,'leadsathi',$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [org.id, project?.id || null, leadName, phone, leadEmail, reference, qualified ? 'qualified' : 'contacted', temp, leadBudget, leadConfig, leadPurpose, leadTimeline, summary]);
    await logLead(lead.id, null, 'created', `From LeadSathi AI (${channel})`);
  } else {
    lead = await one(`UPDATE leads SET name = CASE WHEN (source='leadsathi' AND source_ref=$11) OR lower(COALESCE(name,'')) IN ('test customer','customer','unknown') THEN COALESCE(NULLIF($2,''),name) ELSE COALESCE(name,NULLIF($2,'')) END,
                        email = COALESCE($3,email), temperature = $4, budget = COALESCE($5,budget), config_pref = COALESCE($6,config_pref), purpose = COALESCE($7,purpose),
                        timeline = COALESCE($8,timeline), ai_summary = COALESCE($9,ai_summary), stage = CASE WHEN $10 AND stage IN ('new','contacted') THEN 'qualified' ELSE stage END, updated_at = now()
                      WHERE id = $1 RETURNING *`, [lead.id, leadName, leadEmail, temp, leadBudget, leadConfig, leadPurpose, leadTimeline, summary, qualified, reference]);
    await logLead(lead.id, null, 'ai', `LeadSathi: ${summary || event}`);
  }
  const s = settingsOf(org).routing;
  if (!lead.assigned_to && (s.assign_on === 'immediately' || lead.stage !== 'contacted')) {
    await assignLead(lead.id);
    lead = await one('SELECT * FROM leads WHERE id=$1',[lead.id]);
  } else if (!lead.assigned_to) await notify(org.id, null, 'lead', `New lead from LeadSathi: ${lead.name || phone}`, `/leads/${lead.id}`);
  // A requested slot is scheduled pending confirmation, never marked confirmed.
  const at = visitAt ? new Date(visitAt) : null;
  if (at) {
    const active = await one("SELECT id FROM site_visits WHERE lead_id=$1 AND status IN ('scheduled','confirmed')",[lead.id]);
    if (!active) {
      await q(`INSERT INTO site_visits(org_id,lead_id,project_id,agent_id,scheduled_at) VALUES ($1,$2,$3,$4,$5)`,[org.id,lead.id,lead.project_id,lead.assigned_to,at]);
      await q("UPDATE leads SET stage='visit_scheduled' WHERE id=$1 AND stage IN ('new','contacted','qualified')",[lead.id]);
      await logLead(lead.id,null,'visit',`Site visit requested through LeadSathi for ${at.toISOString()}; sales team confirmation required.`);
    }
  }
  res.json({ ok: true, lead_id: lead.id });
}));

function optionalBridgeText(value, label, max) {
  return value === undefined || value === null || value === '' ? null : text(value, label, { optional: false, max });
}

export default r;
