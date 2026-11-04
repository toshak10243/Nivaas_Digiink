// No login needed: the shareable project/flat page, its enquiry form, and the LeadSathi bridge.
import { Router } from 'express';
import { one, many, q } from '../db.js';
import { h, fail } from '../lib/auth.js';
import { costSheet } from '../lib/pricing.js';
import { settingsOf } from '../settings.js';
import { notify, logLead } from '../services/notify.js';
import { assignLead } from '../services/routing.js';
import { normPhone } from '../services/meta.js';

const r = Router();

// ---------- /p/:token — what the customer sees when they open a shared link ----------
r.get('/p/:token', h(async (req, res) => {
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

r.post('/p/:token/enquire', h(async (req, res) => {
  const link = await one(`SELECT s.*, u.role FROM share_links s JOIN users u ON u.id = s.created_by WHERE s.token = $1`, [req.params.token]);
  if (!link) throw fail(404, 'This link has expired');
  const { name, phone, message, unit_no, visit } = req.body || {};
  const ph = normPhone(phone);
  if (!name || ph.length < 10) throw fail(400, 'Please enter your name and a valid mobile number');
  const unit = unit_no ? await one(`SELECT id FROM units WHERE project_id = $1 AND unit_no = $2`, [link.project_id, unit_no]) : null;
  let lead = link.lead_id ? await one(`SELECT * FROM leads WHERE id = $1`, [link.lead_id]) : await one(`SELECT * FROM leads WHERE org_id = $1 AND phone = $2 AND stage <> 'lost'`, [link.org_id, ph]);
  if (!lead) {
    lead = await one(`INSERT INTO leads (org_id, project_id, name, phone, source, source_ref, unit_id, assigned_to, assigned_at, broker_id, stage, notes, temperature)
                      VALUES ($1,$2,$3,$4,'share_link',$5,$6,$7,now(),$8,'qualified',$9,'hot') RETURNING *`,
      [link.org_id, link.project_id, name, ph, link.token, unit?.id || null, link.role === 'admin' ? null : link.created_by, link.role === 'broker' ? link.created_by : null, message || null]);
    await logLead(lead.id, null, 'created', `Enquired from a shared link${unit_no ? ' for ' + unit_no : ''}`);
    if (!lead.assigned_to) await assignLead(lead.id);
  } else {
    await q(`UPDATE leads SET unit_id = COALESCE($2, unit_id), temperature = 'hot', updated_at = now() WHERE id = $1`, [lead.id, unit?.id || null]);
    await logLead(lead.id, null, 'note', `Enquired again from the link${unit_no ? ' about ' + unit_no : ''}${message ? ': ' + message : ''}`);
  }
  if (visit) await logLead(lead.id, null, 'note', `Wants a site visit: ${visit}`);
  await notify(link.org_id, lead.assigned_to || link.created_by, 'lead', `${name} enquired${unit_no ? ' about ' + unit_no : ''} from your link. Call ${ph}`, `/leads/${lead.id}`);
  res.json({ ok: true });
}));

// ---------- LeadSathi → Nivaas ----------
// In LeadSathi: Settings → Integrations → Webhook URL = the URL shown in Nivaas → Integrations.
// LeadSathi posts {event: 'new_lead'|'hot_lead', lead: {id, name, phone, tag, summary, lead_fields, channel_type}}
r.post('/bridge/leadsathi/:orgId', h(async (req, res) => {
  const org = await one(`SELECT * FROM orgs WHERE id = $1`, [req.params.orgId]);
  if (!org || (req.query.secret || req.get('x-nivaas-secret')) !== org.bridge_secret) throw fail(401, 'Bad secret');
  const { event, lead: L = {} } = req.body || {};
  const f = L.lead_fields || {};
  const phone = normPhone(L.phone || f.phone);
  if (!phone) return res.json({ ok: true, skipped: 'no phone yet' });
  const projects = await many(`SELECT id, name FROM projects WHERE org_id = $1`, [org.id]);
  const hint = `${f.project || ''} ${f.location || ''} ${L.summary || ''}`.toLowerCase();
  const project = projects.find(p => hint.includes(p.name.toLowerCase().split(' ')[0])) || projects[0];
  const temp = L.tag === 'hot' ? 'hot' : L.tag === 'cold' ? 'cold' : 'warm';
  const qualified = event === 'hot_lead' || L.tag === 'hot';
  let lead = await one(`SELECT * FROM leads WHERE org_id = $1 AND phone = $2 AND stage <> 'lost'`, [org.id, phone]);
  if (!lead) {
    lead = await one(`INSERT INTO leads (org_id, project_id, name, phone, source, source_ref, stage, temperature, budget, config_pref, purpose, timeline, ai_summary)
                      VALUES ($1,$2,$3,$4,'leadsathi',$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [org.id, project?.id || null, L.name || null, phone, L.id || null, qualified ? 'qualified' : 'contacted', temp, f.budget || null, f.config || f.configuration || null, f.purpose || null, f.timeline || null, L.summary || null]);
    await logLead(lead.id, null, 'created', `From LeadSathi AI (${L.channel_type || 'chat'})`);
  } else {
    lead = await one(`UPDATE leads SET name = COALESCE(name,$2), temperature = $3, budget = COALESCE($4,budget), config_pref = COALESCE($5,config_pref), purpose = COALESCE($6,purpose),
                        timeline = COALESCE($7,timeline), ai_summary = COALESCE($8,ai_summary), stage = CASE WHEN $9 AND stage IN ('new','contacted') THEN 'qualified' ELSE stage END, updated_at = now()
                      WHERE id = $1 RETURNING *`, [lead.id, L.name || null, temp, f.budget || null, f.config || f.configuration || null, f.purpose || null, f.timeline || null, L.summary || null, qualified]);
    await logLead(lead.id, null, 'ai', `LeadSathi: ${L.summary || event}`);
  }
  if (f.visit && !(await one(`SELECT 1 FROM site_visits WHERE lead_id = $1 AND status = 'scheduled'`, [lead.id]))) {
    const at = new Date(f.visit);
    if (!isNaN(at)) await q(`INSERT INTO site_visits (org_id, lead_id, project_id, agent_id, scheduled_at) VALUES ($1,$2,$3,$4,$5)`, [org.id, lead.id, lead.project_id, lead.assigned_to, at]);
  }
  const s = settingsOf(org).routing;
  if (!lead.assigned_to && (s.assign_on === 'immediately' || lead.stage !== 'contacted')) await assignLead(lead.id);
  else if (!lead.assigned_to) await notify(org.id, null, 'lead', `New lead from LeadSathi: ${lead.name || phone}`, `/leads/${lead.id}`);
  res.json({ ok: true, lead_id: lead.id });
}));

export default r;
