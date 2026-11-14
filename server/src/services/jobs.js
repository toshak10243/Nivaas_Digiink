// Background jobs, every minute: AI twin take-overs, lead re-routing, expired holds, ticket SLA alerts.
import { many, q } from '../db.js';
import { reply } from './twin.js';
import { reassignStale } from './routing.js';
import { notify } from './notify.js';

async function twinTakeovers() {
  const due = await many(`SELECT id FROM chats WHERE ai_enabled AND pending_ai_at IS NOT NULL AND pending_ai_at <= now()
                          AND (last_agent_at IS NULL OR last_agent_at < last_customer_at)`);
  for (const c of due) await reply(c.id).catch(e => console.error('[twin]', e.message));
}

async function expireHolds() {
  const rows = await many(`UPDATE units SET status = 'available', hold_by = NULL, hold_until = NULL, updated_at = now()
                           WHERE status = 'hold' AND hold_until < now() RETURNING unit_no, hold_by, project_id`);
  for (const u of rows) if (u.hold_by) {
    const p = (await many(`SELECT org_id FROM projects WHERE id = $1`, [u.project_id]))[0];
    await notify(p.org_id, u.hold_by, 'inventory', `Your hold on ${u.unit_no} expired. The unit is available again.`, '/inventory');
  }
}

async function ticketSla() {
  const late = await many(`UPDATE tickets SET sla_alerted = true WHERE status IN ('open','in_progress') AND sla_due_at < now() AND NOT sla_alerted
                           RETURNING id, org_id, number, title, assigned_to`);
  for (const t of late) {
    await notify(t.org_id, null, 'ticket', `SLA missed: ticket #${t.number} "${t.title}"`, `/tickets/${t.id}`);
    if (t.assigned_to) await notify(t.org_id, t.assigned_to, 'ticket', `Overdue: ticket #${t.number} "${t.title}"`, `/tickets/${t.id}`);
  }
}

export function startJobs() {
  let stopped = false;
  let running = false;
  const run = async () => {
    if (stopped || running) return;
    running = true;
    try {
      for (const job of [twinTakeovers, reassignStale, expireHolds, ticketSla]) {
        try { await job(); } catch (e) { console.error('[job]', job.name, e.message); }
      }
    } finally { running = false; }
  };
  const interval = setInterval(run, 60 * 1000);
  const initial = setTimeout(run, 5000);
  return () => {
    stopped = true;
    clearInterval(interval);
    clearTimeout(initial);
  };
}
