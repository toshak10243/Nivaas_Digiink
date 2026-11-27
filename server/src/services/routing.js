// Lead routing: who should handle this lead, and hand the conversation to their WhatsApp number.
import { one, many, q } from '../db.js';
import { settingsOf } from '../settings.js';
import { notify, notifyAdminsOnce, logLead } from './notify.js';
import * as meta from './meta.js';
import { config } from '../config.js';
import { eligibleAssignees } from '../lib/lead-routing.js';

const OPEN = `('new','contacted','qualified','visit_scheduled','visit_done','negotiation')`;

export async function pickAssignee(lead, { exclude = [] } = {}) {
  const org = await one(`SELECT * FROM orgs WHERE id = $1`, [lead.org_id]);
  const s = settingsOf(org).routing;
  const project = lead.project_id ? await one(`SELECT sales_pool FROM projects WHERE id = $1`, [lead.project_id]) : null;
  const roles = s.include_brokers ? ['sales', 'broker'] : ['sales'];
  let people = await many(
    `SELECT u.id, u.name, u.role, u.profile,
       (SELECT count(*)::int FROM leads l WHERE l.assigned_to = u.id AND l.stage IN ${OPEN}) AS load,
       (SELECT max(assigned_at) FROM leads l WHERE l.assigned_to = u.id) AS last_at
     FROM users u WHERE u.org_id = $1 AND u.active AND u.role = ANY($2)`, [lead.org_id, roles]);
  if (project?.sales_pool?.length) people = people.filter(p => project.sales_pool.includes(p.id) || p.role === 'broker');
  people = eligibleAssignees(people, { respectAvailability: s.respect_availability, exclude });
  if (!people.length) return null;
  const byTime = (a, b) => new Date(a.last_at || 0) - new Date(b.last_at || 0);
  people.sort(s.strategy === 'round_robin' ? byTime : (a, b) => a.load - b.load || byTime(a, b));
  return people[0];
}

/** Assigns (or re-assigns) a lead and moves the chat to the assignee's own WhatsApp number. */
export async function assignLead(leadId, { actorId = null, userId = null, reason = 'auto', exclude = [], handoff = true } = {}) {
  const lead = await one(`SELECT * FROM leads WHERE id = $1`, [leadId]);
  if (!lead) return null;
  const who = userId ? await one(`SELECT id, name, role, profile FROM users WHERE id = $1 AND org_id = $2`, [userId, lead.org_id]) : await pickAssignee(lead, { exclude });
  if (!who) { await notify(lead.org_id, null, 'routing', `No sales agent available for ${lead.name || lead.phone}. Please assign manually.`, `/leads/${lead.id}`); return null; }
  const reassign = lead.assigned_to && lead.assigned_to !== who.id;
  await q(`UPDATE leads SET assigned_to = $2, assigned_at = now(), first_touch_at = NULL, reassign_count = reassign_count + $3, updated_at = now() WHERE id = $1`,
    [lead.id, who.id, reassign && reason === 'sla' ? 1 : 0]);
  await logLead(lead.id, actorId, reassign ? 'reassigned' : 'assigned', `${reassign ? 'Reassigned' : 'Assigned'} to ${who.name}${reason === 'sla' ? ' (no response in time)' : reason === 'manual' ? '' : ' automatically'}`);
  await notify(lead.org_id, who.id, 'lead_assigned', `New lead: ${lead.name || lead.phone}${lead.config_pref ? ' · ' + lead.config_pref : ''}${lead.budget ? ' · ' + lead.budget : ''}`, `/leads/${lead.id}`);
  if (reassign) await notify(lead.org_id, lead.assigned_to, 'lead_removed', `${lead.name || lead.phone} was moved to ${who.name}`, `/leads/${lead.id}`);
  if (handoff) await handoffChat(lead, who);
  return who;
}

/** Introduce the agent from their own number, so the customer now chats with them (or their AI twin). */
async function handoffChat(lead, who) {
  const num = await one(`SELECT * FROM wa_numbers WHERE user_id = $1`, [who.id]);
  if (!num || !lead.phone) return;
  const chat = await one(
    `INSERT INTO chats (org_id, lead_id, wa_number_id, agent_id) VALUES ($1,$2,$3,$4)
     ON CONFLICT (lead_id, wa_number_id) DO UPDATE SET agent_id = EXCLUDED.agent_id RETURNING *`,
    [lead.org_id, lead.id, num.id, who.id]);
  if (lead.whatsapp_consent !== 'opted_in') {
    await q(`INSERT INTO chat_messages (chat_id, sender, body) VALUES ($1,'system',$2)`, [chat.id, 'Agent assigned. Intro message not sent because WhatsApp opt-in is not recorded.']);
    return;
  }
  try {
    if (!config.meta.introTemplate) throw new Error('No WA_INTRO_TEMPLATE is configured.');
    const templates = await meta.listTemplates(num);
    const template = templates.find(item => item.name === config.meta.introTemplate && item.language === config.meta.templateLang && String(item.status).toUpperCase() === 'APPROVED');
    if (!template) throw new Error('Configured intro template is not approved for its configured language.');
    const body = (template.components || []).find(component => String(component.type).toUpperCase() === 'BODY')?.text || template.name;
    const indexes = [...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map(match => Number(match[1]));
    if (/\{\{/.test(body) && !indexes.length) throw new Error('Configured intro template uses unsupported named parameters.');
    if ((template.components || []).some(component => {
      const type = String(component.type).toUpperCase();
      return type === 'HEADER' && (component.format !== 'TEXT' || /\{\{/.test(component.text || '')) ||
        type === 'BUTTONS' && (component.buttons || []).some(button => /\{\{/.test(button.url || ''));
    })) throw new Error('Configured intro template has dynamic header or button fields not supported by automatic handoff.');
    const values = [lead.name || 'there', who.name, lead.project_id ? (await one(`SELECT name FROM projects WHERE id = $1`, [lead.project_id]))?.name || 'our project' : 'our project'];
    if (indexes.some(index => index < 1 || index > values.length)) throw new Error('Configured intro template requires more values than Nivaas can provide.');
    const sent = await meta.sendApprovedTemplate(num, meta.normPhone(lead.phone), template.name, template.language, indexes.map(index => values[index - 1]));
    let preview = body;
    indexes.forEach(index => { preview = preview.replace(new RegExp(`\\{\\{\\s*${index}\\s*\\}\\}`), values[index - 1]); });
    await q(`INSERT INTO chat_messages (chat_id, sender, body, ext_id, delivery_status, status_updated_at) VALUES ($1,'agent',$2,$3,'accepted',now())`,
      [chat.id, `[Template: ${template.name}] ${preview}`, sent?.messages?.[0]?.id || null]);
  } catch (e) {
    await q(`INSERT INTO chat_messages (chat_id, sender, body) VALUES ($1,'system',$2)`, [chat.id, `Could not send the intro message: ${e.message}`]);
    await notifyAdminsOnce(lead.org_id, 'integration_error', `WhatsApp agent-introduction failed for ${lead.name || lead.phone}: ${String(e.message).slice(0, 350)}`, '/settings');
  }
}

/** Job: leads nobody touched in time go to the next person (max 2 hops, then the admin is told). */
export async function reassignStale() {
  const orgs = await many(`SELECT id, settings FROM orgs`);
  for (const org of orgs) {
    const s = settingsOf(org).routing;
    const stale = await many(
      `SELECT * FROM leads WHERE org_id = $1 AND assigned_to IS NOT NULL AND first_touch_at IS NULL
         AND broker_id IS NULL AND stage IN ('new','contacted','qualified')
         AND assigned_at < now() - ($2 || ' minutes')::interval`, [org.id, String(s.first_response_min)]);
    for (const l of stale) {
      if (l.reassign_count >= 2) {
        await q(`UPDATE leads SET first_touch_at = now() WHERE id = $1`, [l.id]); // stop retrying
        await notify(org.id, null, 'routing', `${l.name || l.phone} was not picked up after 2 reassignments. Please call them.`, `/leads/${l.id}`);
        continue;
      }
      await assignLead(l.id, { reason: 'sla', exclude: [l.assigned_to] });
    }
  }
}
