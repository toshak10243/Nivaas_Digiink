// The AI twin: answers on a sales agent's WhatsApp number when the agent is away or slow,
// using the project's details and LIVE inventory. Also handles the builder's main number
// if the builder does not use LeadSathi.
import { one, many, q, tx } from '../db.js';
import * as meta from './meta.js';
import { notify, logLead } from './notify.js';
import { assignLead } from './routing.js';
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

export async function knowledge(orgId, projectId) {
  const projects = await many(`SELECT * FROM projects WHERE org_id = $1 ${projectId ? 'AND id = $2' : ''} ORDER BY created_at`, projectId ? [orgId, projectId] : [orgId]);
  const out = [];
  for (const p of projects) {
    const types = await many(`SELECT * FROM unit_types WHERE project_id = $1 ORDER BY bhk`, [p.id]);
    const avail = await many(`SELECT u.*, t.name AS type_name FROM units u LEFT JOIN unit_types t ON t.id = u.unit_type_id WHERE u.project_id = $1 AND u.status = 'available' ORDER BY u.floor, u.unit_no`, [p.id]);
    const mediaTypes = await many(`SELECT t.bhk, t.name, bool_or(m.kind = 'image') AS has_photos, bool_or(m.kind = 'floorplan') AS has_layout, bool_or(m.kind = 'video') AS has_video
      FROM unit_types t JOIN media m ON m.unit_type_id = t.id AND m.kind IN ('image','floorplan','video')
      WHERE t.project_id = $1 GROUP BY t.id ORDER BY t.bhk`, [p.id]);
    out.push(`PROJECT: ${p.name} — ${p.tagline || ''}
Location: ${p.location}, ${p.city}. RERA: ${p.rera_no || 'n/a'}. Status: ${p.status.replace('_', ' ')}. Possession: ${p.possession || 'n/a'}.
${p.description || ''}
Amenities: ${p.amenities.join(', ')}
Payment plan: ${(p.payment_plan || []).map(x => `${x.milestone} ${x.pct}%`).join(' · ')}
Configurations (price = all-inclusive of PLC/parking/club/registry, excluding stamp duty & registration):
${types.map(t => {
  const sample = avail.find(u => u.unit_type_id === t.id);
  const cs = costSheet(p, t, sample || {});
  const n = avail.filter(u => u.unit_type_id === t.id).length;
  return `- ${t.name}: carpet ${t.carpet_sqft} sq ft, built-up ${t.builtup_sqft}, super ${t.super_sqft}. From ${inr(cs.total)}. ${n} available.`;
}).join('\n')}
Media available by configuration: ${mediaTypes.map(t => `${t.bhk} BHK (${t.name}): ${[t.has_photos && 'photos', t.has_layout && 'floor plan', t.has_video && 'videos'].filter(Boolean).join(', ')}`).join('; ') || 'no flat photos, videos, or floor plans uploaded'}.
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
- Answer first, then ask ONE missing detail: preferred configuration (1/2/3/4 BHK), budget, self-use or investment, when they want to buy, a good day/time for a site visit.
- Quote only the prices above. Never offer a discount; say ${agent ? agent.name.split(' ')[0] : 'the team'} will discuss final pricing at the visit.
- Specific unit asked (e.g. "302-F") → say if it is available right now from the list; if not, suggest the closest available ones.
- When the customer clearly agrees to a site visit date, book it automatically and put it in visit_at (ISO 8601, Asia/Kolkata). If they confirm a date without a time, use 11:00 AM IST and say so in your reply. Resolve a date without a year to the next upcoming occurrence. Do not book vague interest, a date proposed by you, or a date the customer has not accepted. Today is ${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })}.
- If the customer asks for photos, videos, or a floor plan/layout, set photo_bhk to the requested 1, 2, 3, or 4. A follow-up such as “send them” refers to a recent media request. If they do not specify a configuration, use their known preference only when clear; otherwise ask which BHK they want and leave photo_bhk empty. Only request media for configurations listed above.
- Loan, legal, possession-delay or complaint questions → say the person will call back, set need_human.
Existing visits: ${JSON.stringify(visits)}
Lead so far: ${JSON.stringify({ name: lead.name, budget: lead.budget, config_pref: lead.config_pref, purpose: lead.purpose, timeline: lead.timeline })}

Return ONLY JSON:
{"reply":"", "lead":{"name":"","email":"","budget":"","config_pref":"","purpose":"","timeline":""}, "unit_no":"", "visit_at":"", "photo_bhk":"", "temperature":"hot|warm|cold", "summary":"2 short English sentences for the agent", "need_human":""}`;

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
    const text = await callGemini({ prompt, system, jsonMode: true, temperature: 0.3, signal: AbortSignal.timeout(25000) });
    out = parse(text);
    out.visit_at = normalizeVisitAt(out.visit_at);
    if (out.visit_at && !customerConfirmedVisitDate(history)) out.visit_at = null;
    if (out.visit_at) {
      const dateText = new Date(out.visit_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
      if (!String(out.reply || '').toLowerCase().includes(dateText.toLowerCase())) out.reply = `${String(out.reply || '').trim()} Site visit confirmed for ${dateText} IST.`.trim();
    }
  } catch (e) {
    await notify(chat.org_id, agent?.id || null, 'chat', `AI twin could not reply to ${lead.name || lead.phone} (${e.message}). Please reply.`, `/chats/${chat.id}`);
    return;
  }

  try { await apply(lead, out, agent, chat); }
  catch (e) {
    await q(`UPDATE chats SET pending_ai_at = NULL WHERE id = $1`, [chat.id]).catch(() => {});
    await q(`INSERT INTO chat_messages (chat_id, sender, body) VALUES ($1,'system',$2)`, [chat.id, `AI CRM update failed: ${e.message}`]);
    await notify(chat.org_id, agent?.id || null, 'chat', `Could not save AI updates for ${lead.name || lead.phone}. Please review the conversation.`, `/chats/${chat.id}`);
    return;
  }
  await q(`UPDATE chats SET pending_ai_at = NULL WHERE id = $1`, [chat.id]);

  if (out.reply) {
    try {
      await meta.sendText(chat, meta.normPhone(lead.phone), out.reply);
      await q(`INSERT INTO chat_messages (chat_id, sender, body) VALUES ($1,'ai',$2)`, [chat.id, out.reply]);
    } catch (e) {
      await q(`INSERT INTO chat_messages (chat_id, sender, body) VALUES ($1,'system',$2)`, [chat.id, 'Send failed: ' + e.message]);
      await notify(chat.org_id, agent?.id || null, 'chat', `WhatsApp could not deliver the AI reply to ${lead.name || lead.phone}: ${e.message}`, `/chats/${chat.id}`);
      return;
    }
  }
  const intent = detectMediaIntent(history, out.photo_bhk, out.lead?.config_pref || lead.config_pref);
  if (intent.bhk) {
    const requestedKinds = intent.kinds;
    const mediaToSend = [];
    for (const kind of requestedKinds) {
      const rows = await many(`SELECT DISTINCT ON (m.url) m.url, m.title, m.kind, t.name AS type_name
        FROM media m JOIN unit_types t ON t.id = m.unit_type_id
        WHERE m.project_id = $1 AND t.bhk = $2 AND m.kind = $3
        ORDER BY m.url, m.sort, m.created_at LIMIT $4`, [lead.project_id, intent.bhk, kind, requestedKinds.length > 1 ? 1 : 2]);
      mediaToSend.push(...rows);
    }
    for (const media of mediaToSend) {
      try {
        const caption = media.kind === 'floorplan' ? `${media.type_name} floor plan` : media.kind === 'video' ? `${media.type_name} video` : `${media.type_name} sample flat`;
        if (media.kind === 'video') await meta.sendVideo(chat, meta.normPhone(lead.phone), media.url, caption);
        else await meta.sendImage(chat, meta.normPhone(lead.phone), media.url, caption);
        const label = media.kind === 'floorplan' ? 'Floor plan' : media.kind === 'video' ? 'Video' : 'Photo';
        await q(`INSERT INTO chat_messages (chat_id, sender, body) VALUES ($1,'ai',$2)`, [chat.id, `[${label} sent: ${media.title || media.type_name}]`]);
      } catch (e) {
        await q(`INSERT INTO chat_messages (chat_id, sender, body) VALUES ($1,'system',$2)`, [chat.id, 'Media send failed: ' + e.message]);
        await notify(chat.org_id, agent?.id || null, 'chat', `Could not send ${media.type_name} media to ${lead.name || lead.phone}: ${e.message}`, `/chats/${chat.id}`);
      }
    }
  }
}

const photoTerms = /\b(photo(?:s)?|picture(?:s)?|image(?:s)?|pics?|interior|sample\s*flat)\b|फोटो|तस्वीर/i;
const layoutTerms = /\b(layout|floor\s*plans?|floorplans?|blueprint)\b|नक्शा|naksha/i;
const videoTerms = /\b(videos?|clip)\b|वीडियो/i;
const followupTerms = /\b(send|bhej(?:o|na)?|dikha(?:o|na)?|show|share|yes|haan|ha|please|sure|them|it|[1-4]\s*bhk)\b/i;

/** Resolves short media follow-ups from recent customer context. */
export function detectMediaIntent(history, modelBhk = '', preference = '') {
  const turns = history.slice(-12);
  const customers = turns.map((m, i) => ({ ...m, i })).filter(m => m.sender === 'customer');
  const latest = customers.at(-1);
  if (!latest) return { bhk: 0, kinds: [] };
  const hasTerms = body => photoTerms.test(body) || layoutTerms.test(body) || videoTerms.test(body);
  const request = hasTerms(latest.body) ? latest : [...customers].reverse().find(m => hasTerms(m.body));
  if (!request || (request !== latest && !followupTerms.test(latest.body))) return { bhk: 0, kinds: [] };
  if (turns.slice(request.i + 1).some(m => m.sender === 'ai' && /^\[(?:photo|floor plan|video) sent:/i.test(m.body))) return { bhk: 0, kinds: [] };
  const text = `${request.body} ${request === latest ? '' : latest.body}`;
  const kinds = [...(photoTerms.test(text) ? ['image'] : []), ...(layoutTerms.test(text) ? ['floorplan'] : []), ...(videoTerms.test(text) ? ['video'] : [])];
  const bhkPattern = /\b([1-4])\s*(?:bhk|bed(?:room)?s?)\b/i;
  const requestedBhk = text.match(bhkPattern)?.[1];
  const modelMatch = String(modelBhk || '').match(/^\s*([1-4])\s*(?:bhk)?\s*$/i)?.[1];
  const preferenceBhk = String(preference || '').match(bhkPattern)?.[1];
  const historyBhk = [...turns].reverse().map(m => String(m.body || '').match(bhkPattern)?.[1]).find(Boolean);
  return { bhk: Number(requestedBhk || modelMatch || preferenceBhk || historyBhk || 0), kinds };
}

function customerConfirmedVisitDate(history) {
  const latestIndex = history.map(m => m.sender).lastIndexOf('customer');
  if (latestIndex < 0) return false;
  const latest = String(history[latestIndex].body || '');
  const dateMention = /\b(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}(?:st|nd|rd|th)?\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+\d{4})?|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?|today|tomorrow|this\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i;
  const visitTerm = /\b(site\s*visit|visit|come|meet|schedule|book|aana|aaunga|aaungi|milne)\b/i;
  if (dateMention.test(latest) && visitTerm.test(latest)) return true;
  if (dateMention.test(latest) && history.slice(0, latestIndex).some(m => m.sender === 'ai' && visitTerm.test(m.body))) return true;
  const affirmative = /\b(yes|yeah|yep|sure|okay|ok|confirmed|confirm|please\s+book|haan|han|theek|bilkul)\b/i.test(latest);
  if (!affirmative) return false;
  return history.slice(0, latestIndex).some(m => m.sender === 'ai' && visitTerm.test(m.body) && dateMention.test(m.body));
}

async function apply(lead, out, agent, chat) {
  const L = out.lead || {};
  const unit = out.unit_no ? await one(`SELECT id FROM units WHERE project_id = $1 AND upper(unit_no) = upper($2)`, [lead.project_id, out.unit_no]) : null;
  const temp = ['hot', 'warm', 'cold'].includes(out.temperature) ? out.temperature : lead.temperature;
  const updateLead = `UPDATE leads SET name = COALESCE(name, NULLIF($2,'')), email = COALESCE(email, NULLIF($3,'')), budget = COALESCE(NULLIF($4,''), budget),
             config_pref = COALESCE(NULLIF($5,''), config_pref), purpose = COALESCE(NULLIF($6,''), purpose), timeline = COALESCE(NULLIF($7,''), timeline),
             ai_summary = COALESCE(NULLIF($8,''), ai_summary), temperature = $9, unit_id = COALESCE($10, unit_id),
             first_touch_at = COALESCE(first_touch_at, CASE WHEN assigned_to IS NOT NULL THEN now() END),
             stage = CASE WHEN stage = 'new' THEN 'contacted' ELSE stage END, updated_at = now() WHERE id = $1`;

  let routed = null;
  if (!lead.assigned_to) {
    routed = await assignLead(lead.id, agent?.role === 'sales' ? { userId: agent.id, handoff: false } : {});
    if (routed && agent?.role === 'sales') await q(`UPDATE chats SET agent_id = $2 WHERE id = $1`, [chat.id, routed.id]);
    lead.assigned_to = routed?.id || lead.assigned_to;
  }

  let existingVisit = false;
  let visit = null;
  await tx(async db => {
    await db.q(updateLead, [lead.id, L.name || '', L.email || '', L.budget || '', L.config_pref || '', L.purpose || '', L.timeline || '', out.summary || '', temp, unit?.id || null]);
    if (!out.visit_at) return;
    const existing = await db.one(`SELECT id, scheduled_at FROM site_visits WHERE lead_id = $1 AND status IN ('scheduled','confirmed') ORDER BY scheduled_at LIMIT 1 FOR UPDATE`, [lead.id]);
    existingVisit = Boolean(existing);
    visit = existing
      ? await db.one(`UPDATE site_visits SET scheduled_at = $2, agent_id = COALESCE($3,agent_id) WHERE id = $1 RETURNING *`, [existing.id, out.visit_at, agent?.id || routed?.id || lead.assigned_to])
      : await db.one(`INSERT INTO site_visits (org_id, lead_id, project_id, agent_id, scheduled_at) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [lead.org_id, lead.id, lead.project_id, agent?.id || routed?.id || lead.assigned_to, out.visit_at]);
    await db.q(`UPDATE leads SET stage = 'visit_scheduled', first_touch_at = COALESCE(first_touch_at, now()), updated_at = now() WHERE id = $1 AND stage NOT IN ('booked','lost')`, [lead.id]);
  });
  if (visit) {
    const when = new Date(visit.scheduled_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
    await q(`INSERT INTO chat_messages (chat_id, sender, body) VALUES ($1,'system',$2)`, [chat.id, `AI scheduled site visit for ${when} IST`]);
    await logLead(lead.id, null, 'visit', `${existingVisit ? 'AI updated the site visit to' : 'AI booked a site visit for'} ${when} IST`);
    await notify(lead.org_id, agent?.id || routed?.id || lead.assigned_to || null, 'visit', `Site visit ${existingVisit ? 'updated' : 'booked'} by AI: ${lead.name || lead.phone}, ${when} IST`, `/leads/${lead.id}`);
  }
  if (out.need_human) await notify(lead.org_id, agent?.id || lead.assigned_to || null, 'chat', `${lead.name || lead.phone} needs you: ${out.need_human}`, `/chats/${chat.id}`);
}

function normalizeVisitAt(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  let source = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(source)) source += 'T11:00:00+05:30';
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(source)) source += '+05:30';
  const parts = source.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!parts) return null;
  const [, year, month, day] = parts.map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (calendarDate.getUTCFullYear() !== year || calendarDate.getUTCMonth() !== month - 1 || calendarDate.getUTCDate() !== day) return null;
  const date = new Date(source);
  return Number.isFinite(date.getTime()) && date.getTime() > Date.now() ? date.toISOString() : null;
}

function parse(text) {
  try { return JSON.parse(text); } catch {}
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s >= 0 && e > s) { try { return JSON.parse(text.slice(s, e + 1)); } catch {} }
  return { reply: text.trim() };
}
