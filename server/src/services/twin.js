// The AI twin: answers on a sales agent's WhatsApp number when the agent is away or slow,
// using the project's details and LIVE inventory. Also handles the builder's main number
// if the builder does not use LeadSathi.
import { one, many, q } from '../db.js';
import { config } from '../config.js';
import * as meta from './meta.js';
import { notify, logLead } from './notify.js';
import { assignLead } from './routing.js';
import { settingsOf } from '../settings.js';
import { costSheet, inr } from '../lib/pricing.js';
import { callGemini } from './gemini.js';

const twinOf = u => ({ mode: 'away', reply_after_min: 5, ...(u?.profile?.ai_twin || {}) });

/** Webhook entry: a customer wrote to one of our WhatsApp numbers. */
export async function inbound(num, { from, name, text, extId }) {
  const phone = meta.normPhone(from);
  const agent = num.user_id ? await one(`SELECT * FROM users WHERE id = $1`, [num.user_id]) : null;
  let lead = await one(`SELECT * FROM leads WHERE org_id = $1 AND phone = $2 AND stage <> 'lost' ORDER BY created_at DESC LIMIT 1`, [num.org_id, phone]);
  if (!lead) {
    const project = await one(`SELECT id FROM projects WHERE org_id = $1 ORDER BY created_at LIMIT 1`, [num.org_id]);
    lead = await one(`INSERT INTO leads (org_id, project_id, name, phone, source, stage, assigned_to, assigned_at)
                      VALUES ($1,$2,$3,$4,'whatsapp','new',$5, CASE WHEN $5::uuid IS NULL THEN NULL ELSE now() END) RETURNING *`,
      [num.org_id, project?.id || null, name || null, phone, agent?.id || null]);
    await logLead(lead.id, null, 'created', `New WhatsApp inquiry on ${agent ? agent.name + "'s number" : 'the main number'}`);
    await notify(num.org_id, agent?.id || null, 'new_lead', `New WhatsApp inquiry from ${name || phone}`, `/leads/${lead.id}`);
  }
  const chat = await one(
    `INSERT INTO chats (org_id, lead_id, wa_number_id, agent_id) VALUES ($1,$2,$3,$4)
     ON CONFLICT (lead_id, wa_number_id) DO UPDATE SET last_customer_at = now() RETURNING *`,
    [num.org_id, lead.id, num.id, agent?.id || null]);
  const saved = await one(`INSERT INTO chat_messages (chat_id, sender, body, ext_id) VALUES ($1,'customer',$2,$3) ON CONFLICT DO NOTHING RETURNING id`, [chat.id, text, extId || null]);
  if (!saved) return; // duplicate delivery
  await q(`UPDATE chats SET last_customer_at = now() WHERE id = $1`, [chat.id]);
  meta.markRead(num, extId);

  if (!chat.ai_enabled) { if (agent) await notify(num.org_id, agent.id, 'chat', `${lead.name || phone}: "${text.slice(0, 80)}"`, `/chats/${chat.id}`); return; }

  const twin = twinOf(agent);
  const away = !agent || (agent.profile?.availability || 'available') === 'away';
  if (!agent || twin.mode === 'always' || (twin.mode === 'away' && away)) return reply(chat.id);
  if (twin.mode === 'off') { await notify(num.org_id, agent.id, 'chat', `${lead.name || phone} is waiting: "${text.slice(0, 80)}"`, `/chats/${chat.id}`); return; }
  // Agent is available: give them a few minutes, then the twin steps in (see jobs.js)
  await q(`UPDATE chats SET pending_ai_at = now() + ($2 || ' minutes')::interval WHERE id = $1`, [chat.id, String(twin.reply_after_min)]);
  await notify(num.org_id, agent.id, 'chat', `${lead.name || phone} messaged you. Your AI twin replies in ${twin.reply_after_min} min if you don't.`, `/chats/${chat.id}`);
}

async function knowledge(orgId, projectId) {
  const projects = await many(`SELECT * FROM projects WHERE org_id = $1 ${projectId ? 'AND id = $2' : ''} ORDER BY created_at`, projectId ? [orgId, projectId] : [orgId]);
  const out = [];
  for (const p of projects) {
    const types = await many(`SELECT * FROM unit_types WHERE project_id = $1 ORDER BY bhk`, [p.id]);
    const avail = await many(`SELECT u.*, t.name AS type_name FROM units u LEFT JOIN unit_types t ON t.id = u.unit_type_id WHERE u.project_id = $1 AND u.status = 'available' ORDER BY u.floor, u.unit_no`, [p.id]);
    out.push(`PROJECT: ${p.name} — ${p.tagline || ''}
Location: ${p.location}, ${p.city}. RERA: ${p.rera_no || 'n/a'}. Status: ${p.status.replace('_', ' ')}. Possession: ${p.possession || 'n/a'}.
${p.description || ''}
Amenities: ${p.amenities.join(', ')}
Payment plan: ${(p.payment_plan || []).map(x => `${x.milestone} ${x.pct}%`).join(' · ')}
Configurations (price = all-inclusive of PLC/parking/club/GST, excluding stamp duty & registration):
${types.map(t => {
  const sample = avail.find(u => u.unit_type_id === t.id);
  const cs = costSheet(p, t, sample || {});
  const n = avail.filter(u => u.unit_type_id === t.id).length;
  return `- ${t.name}: carpet ${t.carpet_sqft} sq ft, built-up ${t.builtup_sqft}, super ${t.super_sqft}. From ${inr(cs.total)}. ${n} available.`;
}).join('\n')}
Available units right now: ${avail.slice(0, 40).map(u => `${u.unit_no} (${u.type_name}, floor ${u.floor}${u.facing ? ', ' + u.facing : ''})`).join('; ') || 'none'}`);
  }
  return out.join('\n\n');
}

/** Generate + send one AI reply for a chat. */
export async function reply(chatId) {
  const chat = await one(`SELECT c.*, n.phone_number_id, n.access_token, n.user_id AS num_user FROM chats c JOIN wa_numbers n ON n.id = c.wa_number_id WHERE c.id = $1`, [chatId]);
  if (!chat || !chat.ai_enabled) return;
  const lead = await one(`SELECT * FROM leads WHERE id = $1`, [chat.lead_id]);
  const org = await one(`SELECT * FROM orgs WHERE id = $1`, [chat.org_id]);
  const agent = chat.agent_id ? await one(`SELECT * FROM users WHERE id = $1`, [chat.agent_id]) : null;
  const history = await many(`SELECT sender, body FROM chat_messages WHERE chat_id = $1 AND sender <> 'system' ORDER BY created_at DESC LIMIT 24`, [chat.id]);
  history.reverse();
  const kb = await knowledge(org.id, lead.project_id);
  const visits = await many(`SELECT scheduled_at, status FROM site_visits WHERE lead_id = $1 ORDER BY scheduled_at DESC LIMIT 3`, [lead.id]);

  const system = `You are the WhatsApp assistant of ${agent ? `${agent.name}, a sales manager at ${org.name}` : org.name}, a real-estate developer. ${agent ? `You reply on ${agent.name}'s behalf while they are busy; write in first person as ${agent.name.split(' ')[0]}'s team ("main ${agent.name.split(' ')[0]} ki team se hoon" is fine).` : ''}
Goal: answer accurately from the facts below, understand what the buyer needs, and book a SITE VISIT.

FACTS (only source of truth; never invent prices, discounts, availability, dates or legal claims):
${kb}

RULES
- Reply in the customer's language and style (Roman Hinglish → natural Hinglish/Hindi; English → English). 1–3 short sentences, WhatsApp tone.
- Answer first, then ask ONE missing detail: preferred configuration (2/3/4 BHK), budget, self-use or investment, when they want to buy, a good day/time for a site visit.
- Quote only the prices above. Never offer a discount; say ${agent ? agent.name.split(' ')[0] : 'the team'} will discuss final pricing at the visit.
- Specific unit asked (e.g. "302-F") → say if it is available right now from the list; if not, suggest the closest available ones.
- When they agree to a day and time for a site visit, confirm it and put it in visit_at (ISO 8601, Asia/Kolkata, today is ${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })}).
- Loan, legal, possession-delay or complaint questions → say the person will call back, set need_human.
Existing visits: ${JSON.stringify(visits)}
Lead so far: ${JSON.stringify({ name: lead.name, budget: lead.budget, config_pref: lead.config_pref, purpose: lead.purpose, timeline: lead.timeline })}

Return ONLY JSON:
{"reply":"", "lead":{"name":"","email":"","budget":"","config_pref":"","purpose":"","timeline":""}, "unit_no":"", "visit_at":"", "temperature":"hot|warm|cold", "summary":"2 short English sentences for the agent", "need_human":""}`;

  const messages = [];
  for (const m of history) {
    const role = m.sender === 'customer' ? 'user' : 'assistant';
    if (messages.at(-1)?.role === role) messages.at(-1).content += '\n' + m.body; else messages.push({ role, content: m.body });
  }
  if (!messages.length || messages[0].role !== 'user') messages.unshift({ role: 'user', content: '(chat started)' });
  if (messages.at(-1).role !== 'user') return; // nothing new to answer

  let out;
  try {
    const prompt = messages.map(m => `${m.role === 'user' ? 'Customer' : 'Assistant'}: ${m.content}`).join('\n\n') + '\n\nAssistant (respond in JSON):';
    const text = await callGemini({ prompt, system, jsonMode: true, temperature: 0.3 });
    out = parse(text);
  } catch (e) {
    await notify(chat.org_id, agent?.id || null, 'chat', `AI twin could not reply to ${lead.name || lead.phone} (${e.message}). Please reply.`, `/chats/${chat.id}`);
    return;
  }

  if (out.reply) {
    try { await meta.sendText(chat, meta.normPhone(lead.phone), out.reply); }
    catch (e) { await q(`INSERT INTO chat_messages (chat_id, sender, body) VALUES ($1,'system',$2)`, [chat.id, 'Send failed: ' + e.message]); }
    await q(`INSERT INTO chat_messages (chat_id, sender, body) VALUES ($1,'ai',$2)`, [chat.id, out.reply]);
  }
  await q(`UPDATE chats SET pending_ai_at = NULL WHERE id = $1`, [chat.id]);
  await apply(lead, out, agent, chat);
}

async function apply(lead, out, agent, chat) {
  const L = out.lead || {};
  const unit = out.unit_no ? await one(`SELECT id FROM units WHERE project_id = $1 AND upper(unit_no) = upper($2)`, [lead.project_id, out.unit_no]) : null;
  const temp = ['hot', 'warm', 'cold'].includes(out.temperature) ? out.temperature : lead.temperature;
  await q(`UPDATE leads SET name = COALESCE(name, NULLIF($2,'')), email = COALESCE(email, NULLIF($3,'')), budget = COALESCE(NULLIF($4,''), budget),
             config_pref = COALESCE(NULLIF($5,''), config_pref), purpose = COALESCE(NULLIF($6,''), purpose), timeline = COALESCE(NULLIF($7,''), timeline),
             ai_summary = COALESCE(NULLIF($8,''), ai_summary), temperature = $9, unit_id = COALESCE($10, unit_id),
             first_touch_at = COALESCE(first_touch_at, CASE WHEN assigned_to IS NOT NULL THEN now() END),
             stage = CASE WHEN stage = 'new' THEN 'contacted' ELSE stage END, updated_at = now() WHERE id = $1`,
    [lead.id, L.name || '', L.email || '', L.budget || '', L.config_pref || '', L.purpose || '', L.timeline || '', out.summary || '', temp, unit?.id || null]);

  if (out.visit_at && !isNaN(new Date(out.visit_at))) {
    const exists = await one(`SELECT id FROM site_visits WHERE lead_id = $1 AND status = 'scheduled'`, [lead.id]);
    if (!exists) {
      await q(`INSERT INTO site_visits (org_id, lead_id, project_id, agent_id, scheduled_at) VALUES ($1,$2,$3,$4,$5)`,
        [lead.org_id, lead.id, lead.project_id, agent?.id || lead.assigned_to, out.visit_at]);
      await q(`UPDATE leads SET stage = 'visit_scheduled' WHERE id = $1 AND stage IN ('new','contacted','qualified')`, [lead.id]);
      const when = new Date(out.visit_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
      await logLead(lead.id, null, 'visit', `AI booked a site visit for ${when}`);
      await notify(lead.org_id, agent?.id || lead.assigned_to || null, 'visit', `Site visit booked by AI: ${lead.name || lead.phone}, ${when}`, `/leads/${lead.id}`);
    }
  }
  if (out.need_human) await notify(lead.org_id, agent?.id || lead.assigned_to || null, 'chat', `${lead.name || lead.phone} needs you: ${out.need_human}`, `/chats/${chat.id}`);

  // Main-number conversations: once qualified (or a visit is booked), hand over to a person.
  if (!agent) {
    const fresh = await one(`SELECT * FROM leads WHERE id = $1`, [lead.id]);
    const org = await one(`SELECT settings FROM orgs WHERE id = $1`, [lead.org_id]);
    const qualified = fresh.stage === 'visit_scheduled' || (fresh.config_pref && fresh.budget) || temp === 'hot';
    if (!fresh.assigned_to && (settingsOf(org).routing.assign_on === 'immediately' || qualified)) {
      if (fresh.stage === 'contacted') await q(`UPDATE leads SET stage = 'qualified' WHERE id = $1`, [lead.id]);
      await assignLead(lead.id);
    }
  }
}

function parse(text) {
  try { return JSON.parse(text); } catch {}
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s >= 0 && e > s) { try { return JSON.parse(text.slice(s, e + 1)); } catch {} }
  return { reply: text.trim() };
}
