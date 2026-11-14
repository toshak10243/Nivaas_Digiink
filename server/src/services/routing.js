// Lead routing: who should handle this lead, and hand the conversation to their WhatsApp number.
import { one, many, q } from '../db.js';
import { settingsOf } from '../settings.js';
import { notify, logLead } from './notify.js';
import * as meta from './meta.js';
import { config } from '../config.js';

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
  people = people.filter(p => !exclude.includes(p.id));
  if (!people.length) return null;
  if (s.respect_availability) {
    const here = people.filter(p => (p.profile?.availability || 'available') !== 'away');
    // nobody around → prefer agents whose AI twin will cover for them
    const covered = people.filter(p => (p.profile?.ai_twin?.mode || 'away') !== 'off');
    people = here.length ? here : covered.length ? covered : people;
  }
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
  const project = lead.project_id ? await one(`SELECT name FROM projects WHERE id = $1`, [lead.project_id]) : null;
  const intro = `Namaste ${lead.name || ''}! I'm ${who.name} from ${project?.name || 'our team'}. I'll help you with your home search from here.`;
  try {
    if (!config.meta.introTemplate) throw new Error('No approved WA_INTRO_TEMPLATE is configured; intro not sent.');
    await meta.sendTemplate(num, meta.normPhone(lead.phone), [lead.name || 'ji', who.name, project?.name || 'our project']);
    await q(`INSERT INTO chat_messages (chat_id, sender, body) VALUES ($1,'system',$2)`, [chat.id, `Intro sent from ${who.name}'s WhatsApp: "${intro}"`]);
  } catch (e) {
    await q(`INSERT INTO chat_messages (chat_id, sender, body) VALUES ($1,'system',$2)`, [chat.id, `Could not send the intro message: ${e.message}`]);
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
