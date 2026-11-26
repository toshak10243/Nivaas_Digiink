// Background jobs, every minute: AI twin take-overs, lead re-routing, expired holds, ticket SLA alerts.
import { many, one, q } from '../db.js';
import { reply } from './twin.js';
import { reassignStale } from './routing.js';
import { notify } from './notify.js';

let paymentAlertsCheckedOn = null;

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

async function buyerPaymentDeadlines() {
  const todayRow = await one(`SELECT CURRENT_DATE::text AS today`);
  if (paymentAlertsCheckedOn === todayRow.today) return;
  const today = new Date(`${todayRow.today}T00:00:00.000Z`);
  const bookings = await many(`SELECT b.id, b.org_id, b.customer_id, b.schedule,
      u.unit_no, p.name AS project_name,
      COALESCE((SELECT sum(pay.amount) FROM payments pay WHERE pay.booking_id = b.id), 0) AS amount_paid
    FROM bookings b JOIN units u ON u.id = b.unit_id JOIN projects p ON p.id = u.project_id
    WHERE b.status <> 'cancelled' AND b.customer_id IS NOT NULL`);
  for (const booking of bookings) {
    const schedule = Array.isArray(booking.schedule) ? booking.schedule : [];
    let remainingPaid = Number(booking.amount_paid || 0);
    for (const installment of schedule) {
      const amount = Number(installment.amount || 0);
      const received = Math.min(amount, Math.max(remainingPaid, 0));
      remainingPaid -= received;
      const balance = Math.max(0, amount - received);
      const dueOn = typeof installment.due === 'string' ? installment.due.trim() : '';
      if (!booking.customer_id || balance <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) continue;
      const dueDate = new Date(`${dueOn}T00:00:00.000Z`);
      if (Number.isNaN(dueDate.getTime()) || dueDate.toISOString().slice(0, 10) !== dueOn) continue;
      const daysUntilDue = Math.round((dueDate - today) / 86400000);
      if (daysUntilDue > 3) continue;
      const dueLabel = dueDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
      const timing = daysUntilDue < 0 ? 'is overdue' : daysUntilDue === 0 ? 'is due today' : `is due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}`;
      const body = `${installment.milestone || 'Payment installment'} for ${booking.unit_no} (${booking.project_name}) ${timing}: ₹${Math.round(balance).toLocaleString('en-IN')} · due ${dueLabel}.`;
      const alreadySent = await one(`SELECT id FROM notifications WHERE org_id = $1 AND user_id = $2 AND kind = 'payment' AND body = $3 AND link = '/portal' LIMIT 1`, [booking.org_id, booking.customer_id, body]);
      if (!alreadySent) await notify(booking.org_id, booking.customer_id, 'payment', body, '/portal');
    }
  }
  paymentAlertsCheckedOn = todayRow.today;
}

export function startJobs() {
  let stopped = false;
  let running = false;
  const run = async () => {
    if (stopped || running) return;
    running = true;
    try {
      for (const job of [twinTakeovers, reassignStale, expireHolds, ticketSla, buyerPaymentDeadlines]) {
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
