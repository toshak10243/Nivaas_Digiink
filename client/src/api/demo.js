// Demo mode: an in-memory copy of the server, answering the same paths with the same shapes.
// Used by `npm run dev:demo` / `build:demo`. Business rules mirror server/src/routes/*.
import { buildSeed } from '../../../shared/seed-data.js';
import { costSheet, scheduleFor, inr } from '../lib/pricing.js';
import { SAMPLE } from '../demo/media.js';

const S = buildSeed();
let n = 1;
const nid = p => `${p}_${n++}`;
const now = () => new Date().toISOString();
const clone = x => JSON.parse(JSON.stringify(x));
const err = (status, message) => Object.assign(new Error(message), { status });
const norm = p => (p || '').replace(/\D/g, '').replace(/^0+/, '').replace(/^(\d{10})$/, '91$1');

// ---------- build tables ----------
const org = { id: 'org', ...S.org, logo_url: null, bridge_secret: 'demo-secret' };
const DEF = {
  routing: { assign_on: 'qualified', strategy: 'least_loaded', include_brokers: false, first_response_min: 15, respect_availability: true },
  tickets: { sla_hours: 24, urgent_sla_hours: 6, notify_sales_agent: true }, holds: { hours: 48 }, booking: { default_booking_pct: 10 }, emi: { rate: 8.6, tenure_years: 20, down_pct: 20 },
};
const merge = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(b || {})) o[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' ? merge(a[k], v) : v; return o; };
org.settings = merge(DEF, S.org.settings);

const users = S.users.map(u => ({ ...u, active: true, created_at: S.ago(200), last_login: S.ago(0.1) }));
const U = id => users.find(u => u.id === id);
const media = f => `/uploads/sample/${f}`;
const projects = [], types = [], towers = [], units = [], mediaRows = [], updates = [];
for (const p of S.projects) {
  projects.push({ id: p.id, org_id: 'org', name: p.name, tagline: p.tagline, description: p.description, location: p.location, city: p.city, map_url: p.map_url,
    rera_no: p.rera_no, status: p.status, possession: p.possession, rate_sqft: p.rate_sqft, charges: p.charges, payment_plan: p.payment_plan, amenities: p.amenities,
    highlights: p.highlights, cover_url: media(p.cover), brochure_url: null, sales_pool: p.sales_pool, created_at: S.ago(400) });
  for (const t of p.types) { types.push({ ...t, project_id: p.id, floorplan_url: media(t.floorplan) }); mediaRows.push({ id: nid('m'), project_id: p.id, unit_type_id: t.id, kind: 'floorplan', url: media(t.floorplan), title: `${t.name} floor plan`, sort: 50 }); }
  for (const tw of p.towers) towers.push({ id: p.id + ':T' + tw.name, project_id: p.id, name: tw.name, floors: tw.floors });
  p.media.forEach(([kind, f, title, typeId], i) => mediaRows.push({ id: nid('m'), project_id: p.id, unit_type_id: typeId || null, kind, url: media(f), title, sort: i }));
  for (const x of p.updates) updates.push({ id: nid('up'), project_id: p.id, title: x.title, body: x.body, created_at: S.ago(x.days) });
}
for (const u of S.units) units.push({ id: u.id, project_id: u.project, tower_id: u.project + ':T' + u.tower, unit_type_id: u.type, unit_no: u.unit_no, floor: u.floor, facing: u.facing,
  plc_pct: u.plc_pct, price_override: null, status: u.status, hold_by: u.hold_by || null, hold_until: u.hold_hours ? new Date(Date.now() + u.hold_hours * 3600e3).toISOString() : null, notes: u.notes || null });
const P = id => projects.find(p => p.id === id), T = id => types.find(t => t.id === id), UN = id => units.find(u => u.id === id);
const priceOf = u => costSheet(P(u.project_id), T(u.unit_type_id), u);

const bookings = [], payments = [], commissions = [];
for (const b of S.bookings) {
  const u = UN(b.unit), p = P(u.project_id);
  const deal = priceOf(u).total - b.discount;
  const row = { id: b.id, org_id: 'org', unit_id: u.id, lead_id: null, customer_id: b.customer, sold_by: b.sold_by, broker_id: b.broker, deal_value: deal, discount: b.discount,
    booking_amount: Math.round(deal * 0.1), booking_date: S.ago(b.days_ago).slice(0, 10), status: b.status, schedule: scheduleFor(p, deal), notes: null, created_at: S.ago(b.days_ago) };
  bookings.push(row);
  let paid = 0;
  for (const m of row.schedule) { if (paid + m.pct > b.paid_pct) break; paid += m.pct; payments.push({ id: nid('pay'), booking_id: row.id, amount: m.amount, paid_on: S.ago(Math.max(1, b.days_ago - paid)).slice(0, 10), mode: paid <= 10 ? 'Cheque' : 'NEFT', ref: 'UTR' + (100000 + n), milestone: m.milestone }); }
  for (const [who, kind] of [[b.sold_by, 'sales_incentive'], [b.broker, 'broker_commission']]) {
    if (!who) continue;
    const rule = kind === 'sales_incentive' ? U(who).profile.incentive : U(who).profile.commission;
    commissions.push({ id: nid('cm'), org_id: 'org', booking_id: row.id, user_id: who, kind, basis: rule.type === 'flat' ? `Flat ${inr(rule.value)}` : `${rule.value}% of ${inr(deal)}`,
      amount: rule.type === 'flat' ? rule.value : Math.round(deal * rule.value / 100), status: b.days_ago > 60 ? 'paid' : b.days_ago > 20 ? 'approved' : 'pending', paid_on: b.days_ago > 60 ? S.ago(b.days_ago - 30).slice(0, 10) : null, created_at: S.ago(b.days_ago) });
  }
}

const leads = S.leads.map((l, i) => {
  const fAt = i === 0 ? new Date(Date.now() + 2 * 3600e3).toISOString() : i === 1 ? new Date(Date.now() + 26 * 3600e3).toISOString() : i === 2 ? new Date(Date.now() - 5 * 3600e3).toISOString() : null;
  return {
    id: l.id, org_id: 'org', project_id: l.project, name: l.name, phone: l.phone, email: null, source: l.source, source_ref: null, stage: l.stage, temperature: l.temperature,
    budget: l.budget, config_pref: l.config_pref, purpose: l.purpose, timeline: l.timeline, ai_summary: l.ai_summary, notes: null, assigned_to: l.assigned, assigned_at: l.assigned ? S.ago(l.days_ago) : null,
    first_touch_at: l.assigned && l.stage !== 'qualified' ? S.ago(l.days_ago) : null, broker_id: l.broker, unit_id: l.unit, lost_reason: l.lost_reason, reassign_count: 0,
    followup_at: fAt, followup_type: fAt ? (i === 1 ? 'whatsapp' : 'call') : null, followup_note: fAt ? (i === 0 ? 'Discuss 3 BHK corner pricing' : i === 1 ? 'Send updated brochure' : 'Call back to check bank loan approval') : null,
    created_at: S.ago(l.days_ago), updated_at: S.ago(l.days_ago)
  };
});
const events = [];
const SRC = { leadsathi: 'From LeadSathi AI (WhatsApp)', share_link: 'Enquired from a shared link', broker: 'Registered by broker', walk_in: 'Walk-in at site office', whatsapp: 'WhatsApp inquiry', manual: 'Added manually' };
for (const l of leads) {
  events.push({ id: nid('ev'), lead_id: l.id, actor_id: null, kind: 'created', body: SRC[l.source], created_at: l.created_at });
  if (l.assigned_to) events.push({ id: nid('ev'), lead_id: l.id, actor_id: null, kind: 'assigned', body: `Assigned to ${U(l.assigned_to).name} automatically`, created_at: l.assigned_at });
  if (l.source === 'leadsathi' && l.ai_summary) events.push({ id: nid('ev'), lead_id: l.id, actor_id: null, kind: 'ai', body: `LeadSathi: ${l.ai_summary}`, created_at: l.created_at });
}
const visits = S.visits.map((v, i) => ({
  id: nid('v'), org_id: 'org', lead_id: v.lead, project_id: leads.find(l => l.id === v.lead)?.project_id || projects[0]?.id || 'saffron',
  agent_id: v.agent, scheduled_at: v.when, status: v.status, feedback: v.feedback || null,
  visitors_count: i === 0 ? 3 : 2, transport: i === 0 ? 'cab' : 'self', pickup_address: i === 0 ? 'Vaishali Nagar, Jaipur' : null,
  rating: v.status === 'done' ? 5 : null, interested_unit: v.status === 'done' ? '302-F' : null, created_at: S.ago(2)
}));
const waNumbers = ['rohit', 'neha', 'arjun'].map(a => ({ id: 'wa_' + a, org_id: 'org', user_id: a, phone_number_id: 'demo-' + a, display: '+' + U(a).phone.replace(/^(\d{2})(\d{5})(\d+)$/, '$1 $2 $3') }));
const chats = [], chatMsgs = [];
for (const c of S.chats) {
  chats.push({ id: c.id, org_id: 'org', lead_id: c.lead, wa_number_id: 'wa_' + c.agent, agent_id: c.agent, ai_enabled: c.ai, last_customer_at: new Date(Date.now() - 19 * 60000).toISOString(), last_agent_at: null, pending_ai_at: null });
  for (const [sender, body, mins] of c.messages) chatMsgs.push({ id: nid('cm'), chat_id: c.id, sender, body, created_at: new Date(Date.now() - mins * 60000).toISOString() });
}
const tickets = [], ticketFiles = [], ticketComments = [];
S.tickets.forEach((t, i) => {
  const b = t.unit ? bookings.find(x => x.unit_id === t.unit) : bookings[3 + i];
  const created = new Date(Date.now() - t.hours_ago * 3600e3);
  const tk = { id: 'tk' + (i + 1), number: 101 + i, org_id: 'org', booking_id: b.id, unit_id: b.unit_id, customer_id: b.customer_id, category: t.category, title: t.title, description: t.description, priority: t.priority,
    status: t.status, assigned_to: t.assigned, sla_due_at: new Date(created.getTime() + (t.priority === 'urgent' ? 6 : 24) * 3600e3).toISOString(),
    resolved_at: ['resolved', 'closed'].includes(t.status) ? new Date(created.getTime() + 20 * 3600e3).toISOString() : null, rating: t.rating || null, created_at: created.toISOString() };
  tickets.push(tk);
  if (i === 0) ticketFiles.push({ id: nid('tf'), ticket_id: tk.id, url: media('interior-bedroom.jpg') });
  for (const [who, body, h] of t.comments) ticketComments.push({ id: nid('tc'), ticket_id: tk.id, author_id: who, body, internal: false, created_at: new Date(Date.now() - h * 3600e3).toISOString() });
});
let ticketNo = 105;
const shares = S.shares.map((s, i) => ({ id: nid('sh'), org_id: 'org', token: ['saffron302f', 'aravalisharma', 'saffron502f'][i], created_by: s.by, project_id: s.project, unit_id: s.unit, lead_id: s.lead, views: s.views, last_viewed: S.ago(0.12), created_at: S.ago(3) }));
const notifications = [];
const notify = (userId, kind, body, link) => {
  const targets = userId ? [userId] : users.filter(u => u.role === 'admin').map(u => u.id);
  for (const t of targets) notifications.unshift({ id: nid('n'), user_id: t, kind, body, link, read: false, created_at: now() });
};
notify('rohit', 'visit', 'Site visit booked by AI: Aarti Joshi, tomorrow 11:00 am', '/leads/l1');
notify('rohit', 'share_view', 'Aarti Joshi opened your 302-F link', '/leads/l1');
notify(null, 'ticket', 'New complaint. Ticket #102 Â· 102-F: Kitchen socket not working', '/tickets/tk2');
notify(null, 'booking', `${UN('saffron:102-F').unit_no} (Saffron Residency) booked by Neha Jain`, '/bookings/' + bookings.find(b => b.unit_id === 'saffron:102-F').id);
notify('ajay', 'ticket', 'Ticket #101 assigned to you: Seepage on master bathroom wall', '/tickets/tk1');
notify('c0', 'update', 'Construction update: 4th floor slab cast', '/portal');
const log = (lead_id, actor_id, kind, body) => { events.push({ id: nid('ev'), lead_id, actor_id, kind, body, created_at: now() }); const l = leads.find(x => x.id === lead_id); if (l) l.updated_at = now(); };

// ---------- who is looking ----------
let me = null;
const DEMO_LOGINS = { admin: 'admin', sales: 'rohit', broker: 'b_sharma', maintenance: 'ajay', customer: 'c0' };

// ---------- AI (Claude inside the artifact, else scripted) ----------
let samplePromise = null;
const getSample = () => (samplePromise ??= (async () => { try { return window.claude?.use ? await window.claude.use('sample') : null; } catch { return null; } })());

async function twinReply(chat) {
  const lead = leads.find(l => l.id === chat.lead_id), agent = U(chat.agent_id), p = P(lead.project_id);
  const avail = units.filter(u => u.project_id === p.id && u.status === 'available');
  const facts = `${p.name}, ${p.location}. ${p.description} Possession ${p.possession}. RERA ${p.rera_no}.
Types: ${types.filter(t => t.project_id === p.id).map(t => `${t.name} carpet ${t.carpet_sqft} sq ft, super ${t.super_sqft}, from ${inr(costSheet(p, t, avail.find(u => u.unit_type_id === t.id) || {}).total)} all-inclusive (stamp duty extra)`).join('; ')}.
Available now: ${avail.slice(0, 25).map(u => `${u.unit_no} (${T(u.unit_type_id).name}, floor ${u.floor}, ${u.facing})`).join(', ')}.
Payment plan: ${p.payment_plan.map(x => x.milestone + ' ' + x.pct + '%').join(', ')}. Amenities: ${p.amenities.join(', ')}.`;
  const history = chatMsgs.filter(m => m.chat_id === chat.id && m.sender !== 'system').slice(-14).map(m => (m.sender === 'customer' ? 'CUSTOMER: ' : 'YOU: ') + m.body).join('\n');
  const sample = await getSample();
  let out = null;
  if (sample) {
    try {
      out = await sample.json(`You reply on WhatsApp for ${agent.name}, sales manager at ${org.name}, while they are busy. Answer only from these facts, never invent prices or discounts, and try to book a site visit.
FACTS: ${facts}
Lead: ${JSON.stringify({ name: lead.name, budget: lead.budget, config: lead.config_pref })}
CHAT:
${history}
Reply in the customer's language/style (Roman Hinglish â†’ Hinglish), 1–3 short sentences.
Return only JSON: {"reply":"","visit_at":"ISO datetime if a visit day+time was agreed, else empty","summary":"1 sentence for the agent"}`, { modelTier: 'quick', cache: false });
    } catch { out = null; }
  }
  if (!out?.reply) {
    const last = (chatMsgs.filter(m => m.chat_id === chat.id && m.sender === 'customer').at(-1)?.body || '').toLowerCase();
    const unit = (last.match(/\d{3}-?[a-z]/i) || [])[0];
    if (unit) { const u = units.find(x => x.unit_no.toLowerCase() === unit.replace(/(\d{3})-?([a-z])/i, '$1-$2').toLowerCase()); out = { reply: u ? (u.status === 'available' ? `Haan, ${u.unit_no} (${T(u.unit_type_id).name}, ${u.facing}) abhi available hai. All-inclusive lagbhag ${inr(priceOf(u).total)} (stamp duty alag). Site visit kab rakhein?` : `${u.unit_no} abhi available nahi hai. Same type mein ${avail.filter(a => a.unit_type_id === u.unit_type_id).slice(0, 2).map(a => a.unit_no).join(' aur ')} available hain. Dekhna chahenge?`) : 'Ye unit number mujhe list mein nahi mila. Aap 2, 3 ya 4 BHK mein se kya dekh rahe hain?' }; }
    else if (/kal|tomorrow|sunday|saturday|baje|am|pm/.test(last)) out = { reply: 'What date and time would you prefer? I will confirm availability with the team before booking.' };
    else if (/emi|loan/.test(last)) out = { reply: 'Loan eligibility, lender tie-ups, and EMI depend on current lender terms and your profile. I will confirm current details with the team.' };
    else if (/discount|kam|best price/.test(last)) out = { reply: 'I will confirm the current price and any applicable offer with the project team before sharing. Which unit or configuration are you considering?' };
    else out = { reply: `${p.name} mein ${types.filter(t => t.project_id === p.id).map(t => t.name).join(', ')} available hain, possession ${p.possession}. Aapko kaunsa configuration chahiye aur budget kitna hai?` };
  }
  chatMsgs.push({ id: nid('cm'), chat_id: chat.id, sender: 'ai', body: out.reply, created_at: now() });
  if (out.summary) lead.ai_summary = out.summary;
  if (!lead.first_touch_at) lead.first_touch_at = now();
  if (out.visit_at && !isNaN(new Date(out.visit_at)) && !visits.some(v => v.lead_id === lead.id && v.status === 'scheduled')) {
    visits.push({ id: nid('v'), org_id: 'org', lead_id: lead.id, project_id: lead.project_id, agent_id: agent.id, scheduled_at: new Date(out.visit_at).toISOString(), status: 'scheduled', feedback: null, created_at: now() });
    if (['new', 'contacted', 'qualified'].includes(lead.stage)) lead.stage = 'visit_scheduled';
    log(lead.id, null, 'visit', `AI twin booked a site visit for ${new Date(out.visit_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`);
    notify(agent.id, 'visit', `Site visit booked by your AI twin: ${lead.name}`, `/leads/${lead.id}`);
  }
  return out.reply;
}

function pickAssignee(lead, exclude = []) {
  const p = P(lead.project_id);
  let people = users.filter(u => u.role === 'sales' && u.active && !exclude.includes(u.id) && (!p?.sales_pool?.length || p.sales_pool.includes(u.id)));
  const here = people.filter(u => u.profile.availability !== 'away');
  people = here.length ? here : people;
  const load = id => leads.filter(l => l.assigned_to === id && !['booked', 'lost'].includes(l.stage)).length;
  return people.sort((a, b) => load(a.id) - load(b.id))[0] || null;
}
function assign(lead, userId, actor, reason = 'auto') {
  const who = userId ? U(userId) : pickAssignee(lead);
  if (!who) throw err(409, 'Nobody available to assign');
  const re = lead.assigned_to && lead.assigned_to !== who.id;
  lead.assigned_to = who.id; lead.assigned_at = now(); lead.first_touch_at = null;
  log(lead.id, actor, re ? 'reassigned' : 'assigned', `${re ? 'Reassigned' : 'Assigned'} to ${who.name}${reason === 'auto' ? ' automatically (least busy agent)' : ''}`);
  notify(who.id, 'lead_assigned', `New lead: ${lead.name}${lead.config_pref ? ' Â· ' + lead.config_pref : ''}`, `/leads/${lead.id}`);
  const num = waNumbers.find(w => w.user_id === who.id);
  if (num) {
    let chat = chats.find(c => c.lead_id === lead.id && c.wa_number_id === num.id);
    if (!chat) { chat = { id: nid('ch'), org_id: 'org', lead_id: lead.id, wa_number_id: num.id, agent_id: who.id, ai_enabled: true, last_customer_at: null, last_agent_at: null }; chats.push(chat); }
    chatMsgs.push({ id: nid('cm'), chat_id: chat.id, sender: 'system', body: `Intro sent from ${who.name}'s WhatsApp: "Namaste ${lead.name}! I'm ${who.name} from ${P(lead.project_id)?.name || org.name}. I'll help you from here."`, created_at: now() });
  }
  return who;
}

// ---------- helpers that mirror server joins ----------
const leadRow = l => ({ ...l, assigned_name: U(l.assigned_to)?.name || null, assigned_role: U(l.assigned_to)?.role || null, broker_name: U(l.broker_id)?.name || null, project_name: P(l.project_id)?.name || null,
  unit_no: UN(l.unit_id)?.unit_no || null, next_visit: visits.filter(v => v.lead_id === l.id && v.status === 'scheduled').sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0]?.scheduled_at || null });
const scopeLeads = () => leads.filter(l => me.role === 'admin' || (me.role === 'sales' && l.assigned_to === me.id) || (me.role === 'broker' && (l.assigned_to === me.id || l.broker_id === me.id)));
const bookingRow = b => { const u = UN(b.unit_id), c = U(b.customer_id); return { ...b, unit_no: u.unit_no, project_name: P(u.project_id).name, customer_name: c?.name, customer_phone: c?.phone, customer_email: c?.email,
  sold_by_name: U(b.sold_by)?.name || null, broker_name: U(b.broker_id)?.name || null, paid: payments.filter(p => p.booking_id === b.id).reduce((s, p) => s + p.amount, 0) }; };
const unitRow = u => { const t = T(u.unit_type_id), tw = towers.find(x => x.id === u.tower_id), p = P(u.project_id), b = bookings.find(x => x.unit_id === u.id && x.status !== 'cancelled'), cs = priceOf(u);
  return { ...u, type_name: t?.name, bhk: t?.bhk, carpet_sqft: t?.carpet_sqft, builtup_sqft: t?.builtup_sqft, super_sqft: t?.super_sqft, floorplan_url: t?.floorplan_url, tower: tw?.name, project_name: p.name, rate_sqft: p.rate_sqft,
    hold_by_name: U(u.hold_by)?.name || null, booking_id: b?.id || null, sold_by_name: U(b?.sold_by)?.name || null, broker_name: U(b?.broker_id)?.name || null, booking_date: b?.booking_date || null,
    customer_name: ['admin', 'sales'].includes(me.role) ? U(b?.customer_id)?.name || null : null, price: cs.total, base_price: cs.base }; };
const ticketRow = t => { const u = UN(t.unit_id), c = U(t.customer_id); return { ...t, unit_no: u?.unit_no, project_name: P(u?.project_id)?.name, customer_name: c?.name, customer_phone: c?.phone, assigned_name: U(t.assigned_to)?.name || null,
  thumb: ticketFiles.find(f => f.ticket_id === t.id)?.url || null, comments: ticketComments.filter(x => x.ticket_id === t.id).length }; };

// ---------- routes ----------
const routes = [];
const on = (method, pattern, fn) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/?]+)') + '(?:\\?.*)?$'), fn });
const need = (...roles) => { if (!roles.includes(me.role)) throw err(403, 'You do not have access to this'); };

on('GET', '/api/me', () => ({ user: { ...clone(me), whatsapp: waNumbers.find(w => w.user_id === me.id) || null }, org: clone({ ...org, bridge_secret: undefined }), publicUrl: location.origin }));
on('PATCH', '/api/me/profile', (_, b) => { if (b.availability) me.profile.availability = b.availability; if (b.ai_twin) me.profile.ai_twin = { ...me.profile.ai_twin, ...b.ai_twin }; return clone(me); });

on('GET', '/api/dashboard', () => {
  const month = new Date().toISOString().slice(0, 7);
  const live = bookings.filter(b => b.status !== 'cancelled');
  if (me.role === 'admin') {
    const count = (arr, k) => Object.entries(arr.reduce((a, x) => ({ ...a, [x[k]]: (a[x[k]] || 0) + 1 }), {})).map(([key, n]) => ({ [k]: key, n }));
    const trend = Array.from({ length: 6 }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (5 - i)); const m = d.toISOString().slice(0, 7); const bs = live.filter(b => b.booking_date.startsWith(m)); return { month: m, value: bs.reduce((s, b) => s + b.deal_value, 0), units: bs.length }; });
    const mb = live.filter(b => b.booking_date.startsWith(month));
    return { role: 'admin', inventory: count(units, 'status'), sales: { units: mb.length, value: mb.reduce((s, b) => s + b.deal_value, 0) },
      collected: payments.filter(p => p.paid_on.startsWith(month)).reduce((s, p) => s + p.amount, 0), pipeline: count(leads, 'stage'),
      visits: visits.filter(v => ['scheduled', 'confirmed'].includes(v.status)).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)).slice(0, 8).map(v => { const l = leads.find(x => x.id === v.lead_id); return { ...v, name: l?.name, phone: l?.phone, agent: U(v.agent_id)?.name }; }),
      followups: leads.filter(l => l.followup_at && !['booked', 'lost'].includes(l.stage)).sort((a, b) => (a.followup_at || '').localeCompare(b.followup_at || '')).slice(0, 8).map(l => ({ ...l, agent: U(l.assigned_to)?.name })),
      tickets: { open: tickets.filter(t => ['open', 'in_progress'].includes(t.status)).length, late: tickets.filter(t => ['open', 'in_progress'].includes(t.status) && new Date(t.sla_due_at) < new Date()).length },
      leaderboard: users.filter(u => ['sales', 'broker'].includes(u.role)).map(u => { const bs = mb.filter(b => b.sold_by === u.id || b.broker_id === u.id); return { id: u.id, name: u.name, role: u.role, units: bs.length, value: bs.reduce((s, b) => s + b.deal_value, 0) }; }).sort((a, b) => b.units - a.units || b.value - a.value),
      trend };
  }
  if (['sales', 'broker'].includes(me.role)) {
    const mine = scopeLeads();
    const stageCount = Object.entries(mine.reduce((a, l) => ({ ...a, [l.stage]: (a[l.stage] || 0) + 1 }), {})).map(([stage, n]) => ({ stage, n }));
    const mb = live.filter(b => (b.sold_by === me.id || b.broker_id === me.id) && b.booking_date.startsWith(month));
    const cm = commissions.filter(c => c.user_id === me.id);
    return { role: me.role, pipeline: stageCount,
      visits: visits.filter(v => ['scheduled', 'confirmed'].includes(v.status) && (v.agent_id === me.id || leads.find(l => l.id === v.lead_id)?.broker_id === me.id)).map(v => { const l = leads.find(x => x.id === v.lead_id); return { ...v, name: l?.name, phone: l?.phone, lead_id: l?.id }; }),
      followups: mine.filter(l => l.followup_at && !['booked', 'lost'].includes(l.stage)).sort((a, b) => (a.followup_at || '').localeCompare(b.followup_at || '')).slice(0, 8),
      sold: { units: mb.length, value: mb.reduce((s, b) => s + b.deal_value, 0) },
      earnings: { pending: cm.filter(c => ['pending', 'approved'].includes(c.status)).reduce((s, c) => s + c.amount, 0), paid: cm.filter(c => c.status === 'paid').reduce((s, c) => s + c.amount, 0), month: cm.filter(c => c.created_at.startsWith(month) && c.status !== 'void').reduce((s, c) => s + c.amount, 0) },
      waiting: chats.filter(c => c.agent_id === me.id).map(c => ({ c, last: chatMsgs.filter(m => m.chat_id === c.id).at(-1) })).filter(x => x.last?.sender === 'customer').map(({ c }) => { const l = leads.find(x => x.id === c.lead_id); return { id: c.id, name: l.name, phone: l.phone, last_customer_at: c.last_customer_at }; }),
      target: me.profile.target_units || 0 };
  }
  if (me.role === 'maintenance') {
    const open = tickets.filter(t => ['open', 'in_progress'].includes(t.status));
    return { role: 'maintenance', tickets: { open: open.length, mine: open.filter(t => t.assigned_to === me.id).length, late: open.filter(t => new Date(t.sla_due_at) < new Date()).length, resolved_week: tickets.filter(t => t.resolved_at && Date.now() - new Date(t.resolved_at) < 7 * 864e5).length } };
  }
  return { role: me.role };
});
on('GET', '/api/notifications', () => clone(notifications.filter(x => x.user_id === me.id).slice(0, 60)));
on('POST', '/api/notifications/read', () => { notifications.forEach(x => { if (x.user_id === me.id) x.read = true; }); return null; });

// team
on('GET', '/api/team', q => {
  if (me.role !== 'admin' && q.role !== 'sales') throw err(403, 'Admins only');
  return clone(users.filter(u => !q.role || u.role === q.role).map(u => ({ ...u, whatsapp: waNumbers.find(w => w.user_id === u.id)?.display || null,
    open_leads: leads.filter(l => l.assigned_to === u.id && !['booked', 'lost'].includes(l.stage)).length,
    units_sold: bookings.filter(b => (b.sold_by === u.id || b.broker_id === u.id) && b.status !== 'cancelled').length })));
});
on('POST', '/api/team', (_, b) => {
  need('admin');
  if (!b.name || !b.email) throw err(400, 'Name and email are required');
  if (users.some(u => u.email.toLowerCase() === b.email.toLowerCase())) throw err(409, 'This email is already registered');
  const defaults = b.role === 'sales' ? { salary: 25000, incentive: { type: 'percent', value: 0.25 }, target_units: 2, availability: 'available', ai_twin: { mode: 'away', reply_after_min: 5 } } : b.role === 'broker' ? { commission: { type: 'percent', value: 2 }, firm: '' } : {};
  const u = { id: nid('u'), role: b.role, name: b.name, email: b.email, phone: b.phone || '', profile: { ...defaults, ...(b.profile || {}) }, active: true, created_at: now() };
  users.push(u); return { ...clone(u), temp_password: 'Nv' + Math.random().toString(36).slice(2, 8) };
});
on('PATCH', '/api/team/:id', (p, b) => { need('admin'); const u = U(p.id); if (!u) throw err(404, 'Not found'); Object.assign(u, { name: b.name ?? u.name, email: b.email ?? u.email, phone: b.phone ?? u.phone, active: b.active ?? u.active, profile: merge(u.profile, b.profile || {}) }); return clone(u); });
on('POST', '/api/team/:id/reset-password', () => { need('admin'); return { temp_password: 'Nv' + Math.random().toString(36).slice(2, 8) }; });
on('PUT', '/api/org', (_, b) => { need('admin'); Object.assign(org, { name: b.name ?? org.name, phone: b.phone ?? org.phone, email: b.email ?? org.email, address: b.address ?? org.address, rera_promoter: b.rera_promoter ?? org.rera_promoter, settings: merge(org.settings, b.settings || {}) }); return clone(org); });
on('GET', '/api/integrations', () => { need('admin'); return { leadsathi: { webhook_url: `https://nivaas.yourdomain.com/bridge/leadsathi/${org.id}?secret=${org.bridge_secret}` }, whatsapp: { webhook_url: 'https://nivaas.yourdomain.com/webhooks/whatsapp', verify_token: 'nivaas-verify-123', numbers: waNumbers.map(w => ({ ...w, agent: U(w.user_id)?.name || null })) } }; });
on('POST', '/api/integrations/whatsapp', (_, b) => { need('admin'); if (!b.phone_number_id || !b.access_token) throw err(400, 'Phone number ID and access token are required'); const w = { id: nid('wa'), org_id: 'org', user_id: b.user_id || null, phone_number_id: b.phone_number_id, display: b.display }; waNumbers.push(w); return w; });
on('DELETE', '/api/integrations/whatsapp/:id', p => { const i = waNumbers.findIndex(w => w.id === p.id); if (i >= 0) waNumbers.splice(i, 1); return null; });
on('POST', '/api/integrations/rotate-secret', () => { org.bridge_secret = Math.random().toString(16).slice(2); return null; });

// projects & inventory
const projectFull = id => { const p = P(id); if (!p) throw err(404, 'Project not found'); const us = units.filter(u => u.project_id === id);
  return clone({ ...p, towers: towers.filter(t => t.project_id === id), unit_types: types.filter(t => t.project_id === id), media: mediaRows.filter(m => m.project_id === id).sort((a, b) => a.sort - b.sort),
    updates: updates.filter(u => u.project_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    stats: { total: us.length, available: us.filter(u => u.status === 'available').length, hold: us.filter(u => u.status === 'hold').length, sold: us.filter(u => ['booked', 'sold'].includes(u.status)).length } }); };
on('GET', '/api/projects', () => { need('admin', 'sales', 'broker'); return clone(projects.map(p => { const us = units.filter(u => u.project_id === p.id); const ts = types.filter(t => t.project_id === p.id);
  return { ...p, total: us.length, available: us.filter(u => u.status === 'available').length, sold: us.filter(u => ['booked', 'sold'].includes(u.status)).length, from_price: Math.min(...ts.map(t => t.super_sqft * p.rate_sqft)), bhks: [...new Set(ts.map(t => t.bhk))].join(', ') }; })); });
on('GET', '/api/projects/:id', p => { need('admin', 'sales', 'broker'); return projectFull(p.id); });
on('POST', '/api/projects', (_, b) => { need('admin'); if (!b.name) throw err(400, 'Project name is required'); const p = { id: nid('p'), org_id: 'org', name: b.name, city: b.city || 'Jaipur', rate_sqft: Number(b.rate_sqft) || 0, status: 'pre_launch', charges: { parking: 300000, club: 150000, maintenance_deposit: 75000, registry_pct: 7.5, stamp_pct: 6, registration: 30000 }, payment_plan: S.projects[0].payment_plan, amenities: [], highlights: [], sales_pool: [], created_at: now() }; projects.push(p); return projectFull(p.id); });
on('PUT', '/api/projects/:id', (p, b) => { need('admin'); Object.assign(P(p.id), b); return projectFull(p.id); });
on('POST', '/api/projects/:id/unit-types', (p, b) => { need('admin'); const t = { id: nid('t'), project_id: p.id, bathrooms: 2, balconies: 1, ...b }; types.push(t); return t; });
on('PUT', '/api/unit-types/:id', (p, b) => { need('admin'); const t = T(p.id); Object.assign(t, b); return t; });
on('POST', '/api/projects/:id/towers', (p, b) => {
  need('admin'); if (!b.name || !b.floors || !b.per_floor) throw err(400, 'Tower name, floors and units per floor are required');
  const tw = { id: nid('tw'), project_id: p.id, name: b.name, floors: Number(b.floors) }; towers.push(tw);
  for (let f = 1; f <= tw.floors; f++) for (let k = 1; k <= Number(b.per_floor); k++) {
    const no = `${f}${String(k).padStart(2, '0')}-${b.name}`;
    if (units.some(u => u.project_id === p.id && u.unit_no === no)) throw err(409, `${no} already exists`);
    units.push({ id: nid('un'), project_id: p.id, tower_id: tw.id, unit_type_id: (b.types || [])[k - 1] || (b.types || [])[0] || types.find(t => t.project_id === p.id)?.id, unit_no: no, floor: f, facing: (b.facing || [])[k - 1] || null, plc_pct: Number((b.plc || [])[k - 1] || 0), price_override: null, status: 'available' });
  }
  return tw;
});
on('POST', '/api/projects/:id/media', (p, b) => { need('admin'); const out = []; for (const f of b.getAll ? b.getAll('files') : []) { const kind = f.type.startsWith('video') ? 'video' : f.type === 'application/pdf' ? 'brochure' : (b.get('kind') === 'floorplan' ? 'floorplan' : 'image'); const m = { id: nid('m'), project_id: p.id, unit_type_id: b.get('unit_type_id') || null, kind, url: URL.createObjectURL(f), title: b.get('title') || f.name.replace(/\.[^.]+$/, ''), sort: 99 }; mediaRows.push(m); if (kind === 'floorplan') { const type = T(m.unit_type_id); if (type) type.floorplan_url = m.url; } out.push(m); } return out; });
on('DELETE', '/api/media/:id', p => { const i = mediaRows.findIndex(m => m.id === p.id); if (i >= 0) mediaRows.splice(i, 1); return null; });
on('POST', '/api/projects/:id/updates', (p, b) => {
  need('admin', 'sales');
  if (!b.title) throw err(400, 'Title is required');
  const tw = towers.find(t => t.id === b.tower_id);
  const u = {
    id: nid('up'),
    project_id: p.id,
    title: b.title,
    body: b.body || null,
    tower_id: b.tower_id || null,
    tower_name: tw?.name || null,
    stage_name: b.stage_name || null,
    progress_pct: Number(b.progress_pct || 0),
    media_url: b.media_url || null,
    media_urls: b.media_urls || (b.media_url ? [b.media_url] : []),
    created_at: now()
  };
  updates.unshift(u);
  return clone(u);
});
on('DELETE', '/api/projects/:projectId/updates/:updateId', p => {
  const i = updates.findIndex(u => u.id === p.updateId);
  if (i >= 0) updates.splice(i, 1);
  return { ok: true };
});
on('GET', '/api/units', q => { need('admin', 'sales', 'broker'); return clone(units.filter(u => (!q.project_id || u.project_id === q.project_id) && (!q.status || u.status === q.status)).map(unitRow)); });
on('PATCH', '/api/units/:id', (p, b) => {
  const u = UN(p.id); if (!u) throw err(404, 'Unit not found');
  if (b.action === 'hold') { if (u.status !== 'available') throw err(409, `${u.unit_no} is not available`); Object.assign(u, { status: 'hold', hold_by: me.id, hold_until: new Date(Date.now() + org.settings.holds.hours * 3600e3).toISOString() }); notify(null, 'inventory', `${me.name} put ${u.unit_no} on hold for ${org.settings.holds.hours} h`, '/inventory'); }
  else if (b.action === 'release') { if (u.status !== 'hold') throw err(409, 'Unit is not on hold'); if (me.role !== 'admin' && u.hold_by !== me.id) throw err(403, 'Only the person who held it (or an admin) can release it'); Object.assign(u, { status: 'available', hold_by: null, hold_until: null }); }
  else if (b.action === 'block' || b.action === 'unblock') { need('admin'); Object.assign(u, { status: b.action === 'block' ? 'blocked' : 'available', hold_by: null, hold_until: null }); }
  else { need('admin'); Object.assign(u, { plc_pct: b.plc_pct ?? u.plc_pct, price_override: b.price_override === '' ? null : b.price_override ?? u.price_override, facing: b.facing ?? u.facing, notes: b.notes ?? u.notes }); }
  return clone(u);
});

// leads
on('GET', '/api/leads', q => { need('admin', 'sales', 'broker'); return clone(scopeLeads().filter(l => ['stage', 'project_id', 'assigned_to', 'source', 'temperature'].every(k => !q[k] || l[k] === q[k]) && (!q.q || `${l.name} ${l.phone}`.toLowerCase().includes(q.q.toLowerCase())))
  .sort((a, b) => b.updated_at.localeCompare(a.updated_at)).map(leadRow)); });
on('GET', '/api/leads/:id', p => {
  const l = scopeLeads().find(x => x.id === p.id); if (!l) throw err(404, 'Lead not found');
  return clone({ ...l, events: events.filter(e => e.lead_id === l.id).sort((a, b) => b.created_at.localeCompare(a.created_at)).map(e => ({ ...e, actor: U(e.actor_id)?.name || null })),
    visits: visits.filter(v => v.lead_id === l.id).map(v => ({ ...v, agent: U(v.agent_id)?.name })), chats: chats.filter(c => c.lead_id === l.id).map(c => ({ id: c.id, ai_enabled: c.ai_enabled, display: waNumbers.find(w => w.id === c.wa_number_id)?.display, agent: U(c.agent_id)?.name })),
    shares: shares.filter(s => s.lead_id === l.id).map(s => ({ ...s, unit_no: UN(s.unit_id)?.unit_no })), assigned: U(l.assigned_to) ? { id: l.assigned_to, name: U(l.assigned_to).name, role: U(l.assigned_to).role, phone: U(l.assigned_to).phone } : null,
    broker: U(l.broker_id) ? { id: l.broker_id, name: U(l.broker_id).name, firm: U(l.broker_id).profile.firm } : null, project: P(l.project_id) ? { id: l.project_id, name: P(l.project_id).name } : null, unit: UN(l.unit_id) ? { id: l.unit_id, unit_no: UN(l.unit_id).unit_no, status: UN(l.unit_id).status } : null });
});
on('POST', '/api/leads', (_, b) => {
  need('admin', 'sales', 'broker');
  const phone = norm(b.phone); if (!b.name || phone.length < 10) throw err(400, 'Name and a valid phone number are required');
  const d = leads.find(l => l.phone === phone && l.stage !== 'lost'); if (d) throw err(409, `This customer is already registered${U(d.broker_id || d.assigned_to) ? ' with ' + U(d.broker_id || d.assigned_to).name : ''}.`);
  const isB = me.role === 'broker';
  const l = { id: nid('l'), org_id: 'org', project_id: b.project_id || projects[0].id, name: b.name, phone, email: b.email || null, source: isB ? 'broker' : b.source || 'manual', stage: 'contacted', temperature: 'warm', budget: b.budget || null, config_pref: b.config_pref || null,
    purpose: b.purpose || null, timeline: b.timeline || null, notes: b.notes || null, ai_summary: null, broker_id: isB ? me.id : null, assigned_to: me.role === 'admin' ? b.assigned_to || null : me.id, assigned_at: now(), first_touch_at: now(), unit_id: null, created_at: now(), updated_at: now() };
  leads.push(l); log(l.id, me.id, 'created', isB ? `Registered by broker ${me.name}` : `Added by ${me.name}`);
  if (me.role === 'admin' && !l.assigned_to && b.auto_assign) assign(l, null, me.id);
  return clone(l);
});
on('PATCH', '/api/leads/:id', (p, b) => {
  const l = scopeLeads().find(x => x.id === p.id); if (!l) throw err(404, 'Lead not found');
  const old = l.stage;
  for (const k of ['name', 'email', 'budget', 'config_pref', 'purpose', 'timeline', 'notes', 'stage', 'temperature', 'project_id', 'unit_id', 'lost_reason', 'followup_at', 'followup_type', 'followup_note']) if (b[k] !== undefined) l[k] = b[k];
  if (l.assigned_to === me.id && !l.first_touch_at) l.first_touch_at = now();
  l.updated_at = now();
  if (b.stage && b.stage !== old) log(l.id, me.id, 'stage', `Stage: ${old.replace('_', ' ')} â†’ ${b.stage.replace('_', ' ')}${b.lost_reason ? ` (${b.lost_reason})` : ''}`);
  if (b.followup_at) log(l.id, me.id, 'note', `Scheduled follow-up for ${new Date(b.followup_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} (${b.followup_type || 'call'})`);
  return clone(l);
});
on('POST', '/api/leads/:id/assign', (p, b) => { need('admin'); return clone(assign(leads.find(l => l.id === p.id), b.user_id || null, me.id, b.user_id ? 'manual' : 'auto')); });
on('POST', '/api/leads/:id/events', (p, b) => { if (!b.body) throw err(400, 'Write something'); log(p.id, me.id, b.kind === 'call' ? 'call' : 'note', b.body); const l = leads.find(x => x.id === p.id); if (b.kind === 'call') { l.first_touch_at ||= now(); if (l.stage === 'new') l.stage = 'contacted'; } return null; });
on('GET', '/api/visits', () => clone(visits.filter(v => scopeLeads().some(l => l.id === v.lead_id)).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)).map(v => { const l = leads.find(x => x.id === v.lead_id); const p = P(v.project_id); return { ...v, name: l?.name, phone: l?.phone, config_pref: l?.config_pref, project_name: p?.name, project_location: p?.location, project_map_url: p?.map_url, agent: U(v.agent_id)?.name }; })));
on('POST', '/api/visits', (_, b) => {
  let lead = b.lead_id ? leads.find(l => l.id === b.lead_id) : null;
  if (!lead && b.name && b.phone) {
    lead = { id: nid('l'), org_id: 'org', project_id: b.project_id || projects[0]?.id, name: b.name, phone: norm(b.phone), source: 'manual', stage: 'visit_scheduled', temperature: 'warm', assigned_to: me.id, created_at: now(), updated_at: now() };
    leads.unshift(lead);
    log(lead.id, me.id, 'created', `Added lead and booked visit by ${me.name}`);
  }
  if (!lead) throw err(400, 'Please select or provide client details');
  const v = { id: nid('v'), org_id: 'org', lead_id: lead.id, project_id: b.project_id || lead.project_id, agent_id: lead.assigned_to || me.id, scheduled_at: new Date(b.scheduled_at).toISOString(), visitors_count: Number(b.visitors_count) || 1, transport: b.transport || 'self', pickup_address: b.pickup_address || null, status: 'scheduled', feedback: null, created_at: now() };
  visits.unshift(v);
  if (['new', 'contacted', 'qualified'].includes(lead.stage)) lead.stage = 'visit_scheduled';
  log(lead.id, me.id, 'visit', `Site visit booked for ${new Date(b.scheduled_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`);
  return clone(v);
});
on('POST', '/api/leads/:id/visits', (p, b) => { const l = leads.find(x => x.id === p.id); if (!b.scheduled_at) throw err(400, 'Pick a date and time'); const v = { id: nid('v'), org_id: 'org', lead_id: l.id, project_id: l.project_id, agent_id: l.assigned_to || me.id, scheduled_at: new Date(b.scheduled_at).toISOString(), visitors_count: Number(b.visitors_count) || 1, transport: b.transport || 'self', pickup_address: b.pickup_address || null, status: 'scheduled', feedback: null, created_at: now() }; visits.unshift(v);
  if (['new', 'contacted', 'qualified'].includes(l.stage)) l.stage = 'visit_scheduled'; log(l.id, me.id, 'visit', `Site visit scheduled for ${new Date(b.scheduled_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`); return clone(v); });
on('PATCH', '/api/visits/:id', (p, b) => { const v = visits.find(x => x.id === p.id); if (!v) throw err(404, 'Visit not found');
  Object.assign(v, { status: b.status ?? v.status, feedback: b.feedback ?? v.feedback, rating: b.rating ?? v.rating, interested_unit: b.interested_unit ?? v.interested_unit, transport: b.transport ?? v.transport, pickup_address: b.pickup_address ?? v.pickup_address, visitors_count: b.visitors_count ?? v.visitors_count });
  if (b.reschedule_at) v.scheduled_at = new Date(b.reschedule_at).toISOString();
  const l = leads.find(x => x.id === v.lead_id); if (l && b.status === 'done' && ['visit_scheduled', 'qualified', 'contacted'].includes(l.stage)) l.stage = 'visit_done';
  if (l) log(l.id, me.id, 'visit', `Visit marked ${b.status}${b.feedback ? ': ' + b.feedback : ''}`); return clone(v); });

// AI endpoints (objection, handover, passport, smart allocation)
on('POST', '/api/leads/:id/ai-objection', (p, b) => {
  const l = leads.find(x => x.id === p.id);
  const pr = P(l?.project_id);
  const obj = b.objection || 'General inquiry';
  const script = `Namaste ${l?.name?.split(' ')[0] || 'there'}, thanks for sharing your concern about "${obj}". Iâ€™ll confirm the relevant details with the project team and get back to you. Please let me know if you would like to discuss this further.`;
  const keyFacts = [
    pr?.name && `Project record: ${pr.name}`,
    pr?.location && `Location on project record: ${pr.location}`,
    pr?.rate_sqft && `Rate on project record: ${pr.rate_sqft}`,
    pr?.possession && `Possession on project record: ${pr.possession}`,
    pr?.rera_no && `RERA number listed on project record: ${pr.rera_no}`,
    Array.isArray(pr?.amenities) && pr.amenities.length && `Amenities listed: ${pr.amenities.join(', ')}`,
    pr?.payment_plan && `Payment plan on project record: ${pr.payment_plan}`
  ].filter(Boolean);
  return {
    objectionTitle: obj,
    key_facts: keyFacts,
    pitch_script: script,
    responseScript: script,
    whatsapp_message: script,
    isDraft: true,
    reviewNotice: 'Draft for review. Project record details may be incomplete; confirm facts with the responsible project representative before sharing.'
  };
});

on('POST', '/api/leads/:id/ai-handover', (p, b) => {
  const l = leads.find(x => x.id === p.id);
  const pr = P(l?.project_id);
  const brief = {
    summary: `CRM handover draft for ${l?.name || 'lead'}. Stage: ${l?.stage || 'not recorded'}. Configuration preference: ${l?.config_pref || 'not recorded'}. Buyer budget recorded: ${l?.budget || 'not recorded'}. Review the source activity before handover.`,
    keyInterest: [l?.config_pref, pr?.name].filter(Boolean).join(', ') || 'Not recorded',
    offeredPrice: 'No quote recorded in this draft. Review source activity.',
    criticalNotes: ['Confirm buyer preferences, quoted terms, approvals, and commitments from the source records.'],
    recommendedAction: 'Review the CRM timeline and confirm the next step with the assigned team member.',
    isDraft: true,
    reviewNotice: 'AI generated draft. Check the lead timeline and source records before relying on or sharing this summary.'
  };
  if (l) l.handover_summary = brief;
  return brief;
});

on('POST', '/api/visits/:id/ai-passport', (p, b) => {
  const v = visits.find(x => x.id === p.id);
  const passport = {
    flats_shown: b.flats_shown || '',
    price_quoted: b.price_quoted || '',
    commitments: b.commitments || '',
    questions: b.questions || '',
    record_id: p.id,
    recorded_at: now(),
    isDraft: true,
    reviewNotice: 'CRM-entered visit notes; these details are not independently verified.'
  };
  if (v) v.evidence_passport = passport;
  return { passport };
});

on('GET', '/api/visits/allocation-suggestions', q => {
  const t = q.time ? new Date(q.time).getTime() : Date.now();
  const salesUsers = users.filter(u => u.role === 'sales' && u.active);
  const busy = [];
  const available = [];
  for (const u of salesUsers) {
    const conflict = visits.find(v => v.agent_id === u.id && ['scheduled', 'confirmed'].includes(v.status) && Math.abs(new Date(v.scheduled_at).getTime() - t) < 90 * 60000);
    if (conflict) busy.push({ user_id: u.id, name: u.name, conflicting_visit_at: conflict.scheduled_at });
    else available.push({ user_id: u.id, name: u.name });
  }
  return { busy, available };
});

// share
on('POST', '/api/share', (_, b) => {
  let s = shares.find(x => x.created_by === me.id && x.project_id === b.project_id && (x.unit_id || null) === (b.unit_id || null) && (x.lead_id || null) === (b.lead_id || null));
  if (!s) { s = { id: nid('sh'), org_id: 'org', token: Math.random().toString(36).slice(2, 10), created_by: me.id, project_id: b.project_id, unit_id: b.unit_id || null, lead_id: b.lead_id || null, views: 0, last_viewed: null, created_at: now() }; shares.unshift(s); if (b.lead_id) log(b.lead_id, me.id, 'share', 'Shared a project link'); }
  return { ...clone(s), url: `${location.origin}${location.pathname}#/s/${s.token}` };
});
on('GET', '/api/share', () => clone(shares.filter(s => me.role === 'admin' || s.created_by === me.id).map(s => ({ ...s, project_name: P(s.project_id).name, unit_no: UN(s.unit_id)?.unit_no, lead_name: leads.find(l => l.id === s.lead_id)?.name }))));

// chats
on('GET', '/api/chats', () => { need('admin', 'sales'); return clone(chats.filter(c => me.role === 'admin' || c.agent_id === me.id).map(c => { const l = leads.find(x => x.id === c.lead_id); const ms = chatMsgs.filter(m => m.chat_id === c.id); const last = ms.at(-1);
  return { ...c, name: l?.name, phone: l?.phone, stage: l?.stage, temperature: l?.temperature, display: waNumbers.find(w => w.id === c.wa_number_id)?.display, agent: U(c.agent_id)?.name, last_body: last?.body, last_sender: last?.sender, last_at: last?.created_at }; })
  .sort((a, b) => (b.last_at || '').localeCompare(a.last_at || ''))); });

on('POST', '/api/chats', (_, b) => {
  need('admin', 'sales');
  let lead = b.lead_id ? leads.find(l => l.id === b.lead_id) : null;
  if (!lead && b.phone) {
    const ph = String(b.phone).replace(/\D/g, '');
    lead = leads.find(l => l.phone === ph);
    if (!lead) {
      lead = {
        id: nid('l'),
        org_id: 'org',
        name: b.name || 'Client',
        phone: ph,
        source: 'whatsapp',
        stage: 'contacted',
        temperature: 'warm',
        assigned_to: me.id,
        created_at: now(),
        updated_at: now(),
      };
      leads.unshift(lead);
      log(lead.id, me.id, 'created', `Started new WhatsApp chat by ${me.name}`);
    }
  }
  if (!lead) throw new Error('Please select a lead or enter a valid mobile number');
  const num = waNumbers.find(w => w.user_id === me.id) || waNumbers[0];
  let chat = chats.find(c => c.lead_id === lead.id);
  if (!chat) {
    chat = {
      id: nid('ch'),
      org_id: 'org',
      lead_id: lead.id,
      wa_number_id: num.id,
      agent_id: me.id,
      ai_enabled: true,
      last_customer_at: now(),
      last_agent_at: b.initial_message ? now() : null,
      pending_ai_at: null,
    };
    chats.unshift(chat);
  }
  if (b.initial_message?.trim()) {
    chatMsgs.push({
      id: nid('cm'),
      chat_id: chat.id,
      sender: 'agent',
      body: b.initial_message.trim(),
      created_at: now(),
    });
    chat.last_agent_at = now();
  }
  return clone({
    ...chat,
    name: lead.name,
    phone: lead.phone,
    display: num.display,
    messages: chatMsgs.filter(m => m.chat_id === chat.id),
  });
});
on('GET', '/api/chats/:id', p => { const c = chats.find(x => x.id === p.id); const l = leads.find(x => x.id === c.lead_id); return clone({ ...c, name: l.name, phone: l.phone, display: waNumbers.find(w => w.id === c.wa_number_id)?.display, messages: chatMsgs.filter(m => m.chat_id === c.id) }); });
on('POST', '/api/chats/:id/messages', (p, b) => { const c = chats.find(x => x.id === p.id); const m = { id: nid('cm'), chat_id: c.id, sender: 'agent', body: b.text, created_at: now() }; chatMsgs.push(m); c.last_agent_at = now(); const l = leads.find(x => x.id === c.lead_id); l.first_touch_at ||= now(); return m; });
on('PATCH', '/api/chats/:id', (p, b) => { const c = chats.find(x => x.id === p.id); c.ai_enabled = !!b.ai_enabled; chatMsgs.push({ id: nid('cm'), chat_id: c.id, sender: 'system', body: c.ai_enabled ? 'AI twin is back on for this chat' : `${me.name} took over this chat`, created_at: now() }); return null; });
/** demo only: pretend the customer wrote on WhatsApp */
on('POST', '/demo/chats/:id/customer', async (p, b) => {
  const c = chats.find(x => x.id === p.id);
  chatMsgs.push({ id: nid('cm'), chat_id: c.id, sender: 'customer', body: b.text, created_at: now() }); c.last_customer_at = now();
  const agent = U(c.agent_id), twin = agent.profile.ai_twin || { mode: 'away' };
  if (!c.ai_enabled) return { replied: false };
  if (twin.mode === 'off') return { replied: false };
  if (twin.mode === 'away' && agent.profile.availability !== 'away' && !b.force) { c.pending_ai_at = new Date(Date.now() + (twin.reply_after_min || 5) * 60000).toISOString(); return { replied: false, pending: twin.reply_after_min || 5 }; }
  await twinReply(c); c.pending_ai_at = null; return { replied: true };
});
on('POST', '/demo/chats/:id/ai-now', async p => { const c = chats.find(x => x.id === p.id); await twinReply(c); c.pending_ai_at = null; return { replied: true }; });
/** demo only: simulate LeadSathi sending a qualified lead */
on('POST', '/demo/leadsathi', () => {
  const names = ['Abhishek Tiwari', 'Megha Rathi', 'Kunal Bhatia', 'Sonal Pareek'];
  const name = names[Math.floor(Math.random() * names.length)];
  const l = { id: nid('l'), org_id: 'org', project_id: 'saffron', name, phone: '91970' + Math.floor(1e6 + Math.random() * 9e6), email: null, source: 'leadsathi', stage: 'qualified', temperature: 'hot', budget: '₹95 L–1.05 Cr', config_pref: '3 BHK', purpose: 'Self use', timeline: 'Within 2 months',
    ai_summary: 'Wants a 3 BHK at Saffron Residency on a middle floor, budget about ₹1 Cr, self use. Asked for a weekend site visit.', broker_id: null, assigned_to: null, unit_id: null, created_at: now(), updated_at: now() };
  leads.unshift(l); log(l.id, null, 'created', 'From LeadSathi AI (WhatsApp ad)'); log(l.id, null, 'ai', 'LeadSathi qualified: ' + l.ai_summary);
  const who = assign(l, null, null);
  return { lead: clone(l), assigned: who.name };
});

// bookings
on('GET', '/api/bookings', () => clone(bookings.filter(b => me.role === 'admin' || b.sold_by === me.id || b.broker_id === me.id || b.customer_id === me.id).sort((a, b) => b.created_at.localeCompare(a.created_at)).map(bookingRow)));
on('GET', '/api/bookings/:id', p => { const b = bookings.find(x => x.id === p.id); if (!b) throw err(404, 'Booking not found'); const u = UN(b.unit_id), t = T(u.unit_type_id);
  return clone({ ...bookingRow(b), floor: u.floor, facing: u.facing, type_name: t.name, carpet_sqft: t.carpet_sqft, super_sqft: t.super_sqft, project_id: u.project_id, payments: payments.filter(x => x.booking_id === b.id),
    commissions: me.role === 'customer' ? [] : commissions.filter(c => c.booking_id === b.id && (me.role === 'admin' || c.user_id === me.id)).map(c => ({ ...c, name: U(c.user_id).name })) }); });
on('POST', '/api/bookings', (_, b) => {
  need('admin', 'sales');
  const u = UN(b.unit_id); if (!u) throw err(404, 'Unit not found');
  if (!['available', 'hold'].includes(u.status)) throw err(409, `${u.unit_no} is already ${u.status}`);
  if (u.status === 'hold' && u.hold_by !== me.id && me.role !== 'admin') throw err(409, `${u.unit_no} is on hold by someone else`);
  const lead = b.lead_id ? leads.find(l => l.id === b.lead_id) : null;
  const name = b.customer_name || lead?.name, email = (b.customer_email || '').trim();
  if (!name || !email) throw err(400, 'Customer name and email are needed (the email becomes their portal login)');
  const deal = priceOf(u).total - Number(b.discount || 0);
  let cust = users.find(x => x.email.toLowerCase() === email.toLowerCase());
  const fresh = !cust;
  if (!cust) { cust = { id: nid('c'), role: 'customer', name, email, phone: norm(b.customer_phone || lead?.phone), profile: {}, active: true, created_at: now() }; users.push(cust); }
  const soldBy = me.role === 'sales' ? me.id : b.sold_by || lead?.assigned_to || null, brokerId = b.broker_id || lead?.broker_id || null;
  const bk = { id: nid('bk'), org_id: 'org', unit_id: u.id, lead_id: lead?.id || null, customer_id: cust.id, sold_by: soldBy, broker_id: brokerId, deal_value: deal, discount: Number(b.discount || 0), booking_amount: Number(b.booking_amount || 0),
    booking_date: new Date().toISOString().slice(0, 10), status: 'booked', schedule: scheduleFor(P(u.project_id), deal), notes: b.notes || null, created_at: now() };
  bookings.push(bk); Object.assign(u, { status: 'booked', hold_by: null, hold_until: null });
  if (bk.booking_amount) payments.push({ id: nid('pay'), booking_id: bk.id, amount: bk.booking_amount, paid_on: bk.booking_date, mode: b.payment_mode || 'NEFT', ref: b.payment_ref || '', milestone: 'Booking amount' });
  if (lead) { lead.stage = 'booked'; lead.unit_id = u.id; log(lead.id, me.id, 'stage', `Booked ${u.unit_no} for ${inr(deal)}`); }
  for (const [who, kind] of [[soldBy, 'sales_incentive'], [brokerId, 'broker_commission']]) { if (!who) continue; const rule = kind === 'sales_incentive' ? U(who).profile.incentive : U(who).profile.commission; if (!rule?.value) continue;
    commissions.push({ id: nid('cm'), org_id: 'org', booking_id: bk.id, user_id: who, kind, basis: rule.type === 'flat' ? `Flat ${inr(rule.value)} per unit` : `${rule.value}% of ${inr(deal)}`, amount: rule.type === 'flat' ? rule.value : Math.round(deal * rule.value / 100), status: 'pending', paid_on: null, created_at: now() }); }
  notify(null, 'booking', `${u.unit_no} (${P(u.project_id).name}) booked for ${inr(deal)} by ${me.name}`, `/bookings/${bk.id}`);
  return { ...clone(bk), customer_login: fresh ? { email, temp_password: 'home' + Math.floor(1000 + Math.random() * 9000) } : null };
});
on('PATCH', '/api/bookings/:id', (p, b) => {
  need('admin', 'sales');
  const bk = bookings.find(x => x.id === p.id);
  Object.assign(bk, {
    status: b.status ?? bk.status,
    notes: b.notes ?? bk.notes,
    handover_status: b.handover_status ?? bk.handover_status,
    handover_docs: b.handover_docs ?? bk.handover_docs,
    registry_checklist: b.registry_checklist ?? bk.registry_checklist
  });
  if (b.status === 'cancelled') { UN(bk.unit_id).status = 'available'; commissions.filter(c => c.booking_id === bk.id && c.status !== 'paid').forEach(c => (c.status = 'void')); }
  else if (['registered', 'possession'].includes(b.status)) UN(bk.unit_id).status = 'sold'; return clone(bk); });
on('POST', '/api/bookings/:id/payments', (p, b) => { need('admin'); if (!(Number(b.amount) > 0)) throw err(400, 'Enter the amount received'); const x = { id: nid('pay'), booking_id: p.id, amount: Number(b.amount), paid_on: b.paid_on || new Date().toISOString().slice(0, 10), mode: b.mode, ref: b.ref, milestone: b.milestone }; payments.push(x); return x; });
on('GET', '/api/commissions', () => clone(commissions.filter(c => me.role === 'admin' || c.user_id === me.id).sort((a, b) => b.created_at.localeCompare(a.created_at)).map(c => { const b = bookings.find(x => x.id === c.booking_id); const u = UN(b.unit_id); return { ...c, name: U(c.user_id).name, role: U(c.user_id).role, deal_value: b.deal_value, booking_date: b.booking_date, unit_no: u.unit_no, project_name: P(u.project_id).name }; })));
on('PATCH', '/api/commissions/:id', (p, b) => { need('admin'); const c = commissions.find(x => x.id === p.id); c.status = b.status; if (b.status === 'paid') c.paid_on = new Date().toISOString().slice(0, 10); return clone(c); });
on('GET', '/api/payroll', q => { need('admin'); const month = q.month || new Date().toISOString().slice(0, 7);
  return { month, rows: users.filter(u => ['sales', 'broker'].includes(u.role) && u.active).map(u => { const bs = bookings.filter(b => (b.sold_by === u.id || b.broker_id === u.id) && b.status !== 'cancelled' && b.booking_date.startsWith(month)); const cs = commissions.filter(c => c.user_id === u.id && c.status !== 'void' && c.created_at.startsWith(month));
    const salary = u.role === 'sales' ? Number(u.profile.salary || 0) : 0; const variable = cs.reduce((s, c) => s + c.amount, 0);
    return { id: u.id, name: u.name, role: u.role, profile: u.profile, units: bs.length, sales_value: bs.reduce((s, b) => s + b.deal_value, 0), variable, variable_paid: cs.filter(c => c.status === 'paid').reduce((s, c) => s + c.amount, 0), salary, target: u.profile.target_units || 0, total: salary + variable }; }) }; });

// after-sales & buyer handover
on('GET', '/api/portal', () => {
  const allowed = me.role === 'customer'
    ? bookings.filter(b => b.customer_id === me.id && b.status !== 'cancelled')
    : bookings.filter(b => b.status !== 'cancelled');
  return clone({ bookings: allowed.map(b => { const u = UN(b.unit_id), t = T(u.unit_type_id), p = P(u.project_id);
    return { ...bookingRow(b), floor: u.floor, facing: u.facing, type_name: t.name, carpet_sqft: t.carpet_sqft, builtup_sqft: t.builtup_sqft, super_sqft: t.super_sqft, floorplan_url: t.floorplan_url, project_id: p.id, location: p.location, possession: p.possession, cover_url: p.cover_url, brochure_url: p.brochure_url,
      agent_name: U(b.sold_by)?.name, agent_phone: U(b.sold_by)?.phone, payments: payments.filter(x => x.booking_id === b.id), updates: updates.filter(x => x.project_id === p.id).sort((a, c) => c.created_at.localeCompare(a.created_at)) }; }) }); });
const ticketVisible = t => me.role === 'admin' || me.role === 'maintenance' || (me.role === 'customer' && t.customer_id === me.id) || (me.role === 'sales' && bookings.find(b => b.id === t.booking_id)?.sold_by === me.id);
on('GET', '/api/tickets', q => clone(tickets.filter(t => ticketVisible(t) && (!q.status || t.status === q.status)).sort((a, b) => (['resolved', 'closed'].includes(a.status) - ['resolved', 'closed'].includes(b.status)) || a.sla_due_at.localeCompare(b.sla_due_at)).map(ticketRow)));
on('GET', '/api/tickets/:id', p => { const t = tickets.find(x => x.id === p.id); if (!t || !ticketVisible(t)) throw err(404, 'Ticket not found');
  return clone({ ...ticketRow(t), files: ticketFiles.filter(f => f.ticket_id === t.id), comments: ticketComments.filter(c => c.ticket_id === t.id && (me.role !== 'customer' || !c.internal)).map(c => ({ ...c, name: U(c.author_id)?.name || null, role: U(c.author_id)?.role || null })) }); });
on('POST', '/api/tickets', (_, f) => {
  const bk = bookings.find(b => b.id === f.get('booking_id')); if (!bk) throw err(404, 'Booking not found');
  if (!f.get('title')) throw err(400, 'Tell us in a few words what the problem is');
  const pri = f.get('priority') || 'normal', hrs = pri === 'urgent' ? org.settings.tickets.urgent_sla_hours : org.settings.tickets.sla_hours;
  const techs = users.filter(u => u.role === 'maintenance'); const tech = techs.sort((a, b) => tickets.filter(t => t.assigned_to === a.id && ['open', 'in_progress'].includes(t.status)).length - tickets.filter(t => t.assigned_to === b.id && ['open', 'in_progress'].includes(t.status)).length)[0];
  const t = { id: nid('tk'), number: ticketNo++, org_id: 'org', booking_id: bk.id, unit_id: bk.unit_id, customer_id: bk.customer_id, category: f.get('category'), title: f.get('title'), description: f.get('description'), priority: pri, status: 'open', assigned_to: tech?.id || null, sla_due_at: new Date(Date.now() + hrs * 3600e3).toISOString(), resolved_at: null, rating: null, created_at: now() };
  tickets.unshift(t);
  for (const file of f.getAll('photos')) ticketFiles.push({ id: nid('tf'), ticket_id: t.id, url: URL.createObjectURL(file) });
  ticketComments.push({ id: nid('tc'), ticket_id: t.id, author_id: null, body: `Ticket received. ${tech ? tech.name + ' from our maintenance team will' : 'Our team will'} contact you within ${hrs} hours.`, internal: false, created_at: now() });
  const msg = `Ticket #${t.number} Â· ${UN(bk.unit_id).unit_no}: ${t.title}`;
  if (tech) notify(tech.id, 'ticket', `New complaint assigned to you. ${msg}`, `/tickets/${t.id}`);
  if (bk.sold_by) notify(bk.sold_by, 'ticket', `Your customer raised a complaint. ${msg}`, `/tickets/${t.id}`);
  notify(null, 'ticket', `New complaint. ${msg}`, `/tickets/${t.id}`);
  return clone(t);
});
on('PATCH', '/api/tickets/:id', (p, b) => { const t = tickets.find(x => x.id === p.id);
  if (me.role === 'customer') { if (b.rating) { t.rating = Number(b.rating); t.status = 'closed'; } else if (b.status === 'open') { t.status = 'open'; t.resolved_at = null; t.sla_due_at = new Date(Date.now() + 24 * 3600e3).toISOString(); } return null; }
  const old = t.status; Object.assign(t, { status: b.status ?? t.status, assigned_to: b.assigned_to ?? t.assigned_to, priority: b.priority ?? t.priority }); if (['resolved', 'closed'].includes(t.status)) t.resolved_at ||= now();
  const label = { in_progress: 'Our team is working on it', resolved: 'Marked resolved. Please confirm and rate us', closed: 'Closed' }[b.status];
  if (b.status && b.status !== old && label) { ticketComments.push({ id: nid('tc'), ticket_id: t.id, author_id: me.id, body: label, internal: false, created_at: now() }); notify(t.customer_id, 'ticket', `Ticket #${t.number}: ${label}`, `/tickets/${t.id}`); }
  return clone(t); });
on('POST', '/api/tickets/:id/comments', (p, f) => { const t = tickets.find(x => x.id === p.id); const body = (f.get('body') || '').trim(); const files = f.getAll('photos');
  if (!body && !files.length) throw err(400, 'Write a message or add a photo');
  const c = { id: nid('tc'), ticket_id: t.id, author_id: me.id, body: body || '(photo)', internal: me.role !== 'customer' && f.get('internal') === 'true', created_at: now() }; ticketComments.push(c);
  for (const file of files) ticketFiles.push({ id: nid('tf'), ticket_id: t.id, url: URL.createObjectURL(file) });
  if (me.role !== 'customer' && t.status === 'open') t.status = 'in_progress';
  if (me.role === 'customer' && t.assigned_to) notify(t.assigned_to, 'ticket', `Customer replied on #${t.number}`, `/tickets/${t.id}`); else if (!c.internal) notify(t.customer_id, 'ticket', `Reply on your ticket #${t.number}`, `/tickets/${t.id}`);
  return clone(c); });

on('POST', '/auth/password', (_, b) => { if ((b.next || '').length < 8) throw err(400, 'New password must be 8+ characters'); return null; });

// public page
on('GET', '/p/:token', p => {
  const s = shares.find(x => x.token === p.token); if (!s) throw err(404, 'This link has expired or is not valid');
  s.views++; s.last_viewed = now();
  const pr = P(s.project_id), ts = types.filter(t => t.project_id === pr.id), sender = U(s.created_by);
  if (s.views === 1 || Math.random() < 0.3) notify(s.created_by, 'share_view', `${leads.find(l => l.id === s.lead_id)?.name || 'Someone'} opened your ${UN(s.unit_id)?.unit_no || pr.name} link`, s.lead_id ? `/leads/${s.lead_id}` : '/share');
  return clone({ org: { name: org.name, phone: org.phone, address: org.address, rera_promoter: org.rera_promoter }, project: pr, unit_types: ts, media: mediaRows.filter(m => m.project_id === pr.id).sort((a, b) => a.sort - b.sort),
    units: units.filter(u => u.project_id === pr.id).map(u => ({ id: u.id, unit_no: u.unit_no, floor: u.floor, facing: u.facing, status: u.status === 'available' ? 'available' : 'unavailable', unit_type_id: u.unit_type_id, tower: towers.find(t => t.id === u.tower_id)?.name, plc_pct: u.plc_pct, cost: priceOf(u) })),
    unit_id: s.unit_id, agent: { name: sender.name, role: sender.role, firm: sender.profile.firm || null, phone: waNumbers.find(w => w.user_id === sender.id)?.display || sender.phone }, emi: org.settings.emi });
});
on('POST', '/p/:token/enquire', (p, b) => {
  const s = shares.find(x => x.token === p.token); const phone = norm(b.phone);
  if (!b.name || phone.length < 10) throw err(400, 'Please enter your name and a valid mobile number');
  const sender = U(s.created_by); const unit = units.find(u => u.project_id === s.project_id && u.unit_no === b.unit_no);
  let l = leads.find(x => x.phone === phone && x.stage !== 'lost');
  if (!l) { l = { id: nid('l'), org_id: 'org', project_id: s.project_id, name: b.name, phone, source: 'share_link', stage: 'qualified', temperature: 'hot', assigned_to: sender.role === 'admin' ? null : sender.id, assigned_at: now(), broker_id: sender.role === 'broker' ? sender.id : null, unit_id: unit?.id || null, notes: b.message || null, created_at: now(), updated_at: now() }; leads.unshift(l); log(l.id, null, 'created', `Enquired from a shared link${b.unit_no ? ' for ' + b.unit_no : ''}`); }
  if (b.visit) log(l.id, null, 'note', `Wants a site visit: ${b.visit}`);
  notify(l.assigned_to || sender.id, 'lead', `${b.name} enquired${b.unit_no ? ' about ' + b.unit_no : ''} from your link. Call ${phone}`, `/leads/${l.id}`);
  return { ok: true };
});

async function req(method, url, body) {
  await new Promise(r => setTimeout(r, 90));
  const [path, qs] = url.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = path.match(r.re);
    if (!m) continue;
    if (!me && !path.startsWith('/p/')) throw err(401, 'Please log in');
    return await r.fn(method === 'GET' ? { ...m.groups, ...query } : m.groups || {}, method === 'GET' ? query : body ?? {}, query);
  }
  throw err(404, `Demo has no route for ${method} ${path}`);
}

export const demoApi = {
  mode: 'demo',
  isLoggedIn: () => !!me,
  async login(email) { const u = users.find(x => x.email.toLowerCase() === (email || '').toLowerCase()); if (!u) throw err(401, 'In the demo, pick a role below'); me = u; return u; },
  loginAs(role) { me = U(DEMO_LOGINS[role]); return me; },
  logout() { me = null; },
  current: () => me,
  get: p => req('GET', p),
  post: (p, b) => req('POST', p, b),
  put: (p, b) => req('PUT', p, b),
  patch: (p, b) => req('PATCH', p, b),
  del: p => req('DELETE', p),
  media: url => (url?.startsWith('/uploads/sample/') ? SAMPLE[url.split('/').pop()] || url : url),
  shareUrl: token => `${location.origin}${location.pathname}#/s/${token}`,
};
