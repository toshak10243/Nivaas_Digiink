// Background jobs, every minute: AI twin take-overs, lead re-routing, expired holds, ticket SLA alerts.
import { many, one, q } from '../db.js';
import { reply } from './twin.js';
import { reassignStale } from './routing.js';
import { notify } from './notify.js';
import { settingsOf } from '../settings.js';
import { sendEmail } from './mailer.js';
import { config } from '../config.js';

let paymentAlertsCheckedOn = null;
const escapeHtml = value => String(value || '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

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

async function siteVisitReminders() {
  const visits = await many(`SELECT v.id, v.org_id, v.lead_id, v.agent_id, v.scheduled_at, v.status,
      l.name AS customer_name, p.name AS project_name, o.settings,
      (SELECT b.customer_id FROM bookings b WHERE b.org_id = v.org_id AND b.lead_id = v.lead_id
        AND b.status <> 'cancelled' AND b.customer_id IS NOT NULL ORDER BY b.created_at DESC LIMIT 1) AS customer_id
    FROM site_visits v JOIN leads l ON l.id = v.lead_id JOIN orgs o ON o.id = v.org_id
    LEFT JOIN projects p ON p.id = v.project_id
    WHERE v.status IN ('scheduled','confirmed') AND v.scheduled_at > now()
      AND v.scheduled_at <= now() + interval '8 days'`);
  const now = Date.now();
  for (const visit of visits) {
    const hours = settingsOf({ settings: visit.settings }).visits.reminder_hours || [];
    const scheduled = new Date(visit.scheduled_at).getTime();
    for (const hoursBefore of hours) {
      const dueAt = scheduled - Number(hoursBefore) * 60 * 60 * 1000;
      if (dueAt > now || dueAt <= now - 2 * 60 * 1000) continue;
      const when = new Date(visit.scheduled_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
      const period = hoursBefore >= 24 ? `${hoursBefore / 24} day${hoursBefore === 24 ? '' : 's'}` : `${hoursBefore} hours`;
      const link = '/visits';
      const staffBody = `Site visit reminder (${period}): ${visit.customer_name || 'Client'} · ${visit.project_name || 'Project'} · ${when}.`;
      const staff = visit.agent_id ? [visit.agent_id] : (await many(`SELECT id FROM users WHERE org_id = $1 AND role = 'admin' AND active`, [visit.org_id])).map(row => row.id);
      for (const userId of staff) {
        const exists = await one(`SELECT id FROM notifications WHERE org_id = $1 AND user_id = $2 AND kind = 'visit' AND body = $3 AND link = $4 LIMIT 1`, [visit.org_id, userId, staffBody, link]);
        if (!exists) await notify(visit.org_id, userId, 'visit', staffBody, link);
      }
      if (visit.customer_id) {
        const buyerBody = `Reminder: your site visit${visit.project_name ? ` to ${visit.project_name}` : ''} is in ${period}, on ${when}. Open the buyer portal for details.`;
        const exists = await one(`SELECT id FROM notifications WHERE org_id = $1 AND user_id = $2 AND kind = 'visit' AND body = $3 AND link = '/portal' LIMIT 1`, [visit.org_id, visit.customer_id, buyerBody]);
        if (!exists) await notify(visit.org_id, visit.customer_id, 'visit', buyerBody, '/portal');
      }
    }
  }
}

async function previousMonthAdminReports() {
  if (!config.smtp.host || !config.smtp.user) return;
  const day = await one(`SELECT CURRENT_DATE::text AS today`);
  if (day.today.slice(-2) !== '01') return;
  const reportMonth = new Date(`${day.today}T00:00:00Z`);
  reportMonth.setUTCMonth(reportMonth.getUTCMonth() - 1);
  const monthStart = reportMonth.toISOString().slice(0, 7) + '-01';
  const monthEnd = day.today;
  const orgs = await many(`SELECT id,name FROM orgs ORDER BY name`);
  for (const org of orgs) {
    const admins = await many(`SELECT id,name,email FROM users WHERE org_id=$1 AND role='admin' AND active AND email IS NOT NULL`, [org.id]);
    if (!admins.length) continue;
    const [leads, visits, sales, collections, topSource] = await Promise.all([
      one(`SELECT count(*)::int AS total FROM leads WHERE org_id=$1 AND created_at >= $2::date AND created_at < $3::date`, [org.id, monthStart, monthEnd]),
      one(`SELECT count(*) FILTER (WHERE status IN ('scheduled','confirmed','done'))::int AS scheduled,count(*) FILTER (WHERE status='done')::int AS completed FROM site_visits WHERE org_id=$1 AND scheduled_at >= $2::date AND scheduled_at < $3::date`, [org.id, monthStart, monthEnd]),
      one(`SELECT count(*)::int AS units,coalesce(sum(deal_value),0) AS value FROM bookings WHERE org_id=$1 AND status<>'cancelled' AND booking_date >= $2::date AND booking_date < $3::date`, [org.id, monthStart, monthEnd]),
      one(`SELECT coalesce(sum(p.amount),0) AS value FROM payments p JOIN bookings b ON b.id=p.booking_id WHERE b.org_id=$1 AND b.status<>'cancelled' AND p.paid_on >= $2::date AND p.paid_on < $3::date`, [org.id, monthStart, monthEnd]),
      one(`SELECT source,count(*)::int AS leads FROM leads WHERE org_id=$1 AND created_at >= $2::date AND created_at < $3::date GROUP BY source ORDER BY leads DESC LIMIT 1`, [org.id, monthStart, monthEnd]),
    ]);
    const monthLabel = reportMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    for (const admin of admins) {
      const reserved = await one(`INSERT INTO monthly_report_deliveries (org_id,report_month,admin_id,status)
        VALUES ($1,$2::date,$3,'sending') ON CONFLICT (org_id,report_month,admin_id) DO UPDATE SET status='sending',updated_at=now()
        WHERE monthly_report_deliveries.status='sending' AND monthly_report_deliveries.updated_at < now() - interval '15 minutes' RETURNING admin_id`, [org.id, monthStart, admin.id]);
      if (!reserved) continue;
      const html = `<h2>${escapeHtml(org.name)} — ${monthLabel} performance report</h2><p>Hi ${escapeHtml(admin.name || 'Admin')}, here is your previous-month summary.</p>
        <table cellpadding="8" cellspacing="0" border="1" style="border-collapse:collapse"><tr><th>Metric</th><th>Result</th></tr>
        <tr><td>New leads</td><td>${leads.total}</td></tr><tr><td>Site visits scheduled</td><td>${visits.scheduled}</td></tr>
        <tr><td>Visits completed</td><td>${visits.completed}</td></tr><tr><td>Sales</td><td>${sales.units} units · ₹${Number(sales.value).toLocaleString('en-IN')}</td></tr>
        <tr><td>Collections</td><td>₹${Number(collections.value).toLocaleString('en-IN')}</td></tr><tr><td>Top lead source</td><td>${escapeHtml(topSource?.source || 'No leads')}${topSource ? ` (${topSource.leads})` : ''}</td></tr></table>`;
      const sent = await sendEmail({ to: admin.email, subject: `${org.name}: ${monthLabel} CRM report`, html });
      if (sent.ok && !sent.simulated) await q(`UPDATE monthly_report_deliveries SET status='sent',sent_at=now(),updated_at=now() WHERE org_id=$1 AND report_month=$2::date AND admin_id=$3`, [org.id, monthStart, admin.id]);
      else {
        await q(`DELETE FROM monthly_report_deliveries WHERE org_id=$1 AND report_month=$2::date AND admin_id=$3`, [org.id, monthStart, admin.id]);
        console.error(`[monthly report] Delivery to ${admin.email} for ${org.name} was not confirmed${sent.error ? `: ${sent.error}` : ''}`);
      }
    }
  }
}

export function startJobs() {
  let stopped = false;
  let running = false;
  const run = async () => {
    if (stopped || running) return;
    running = true;
    try {
      for (const job of [twinTakeovers, reassignStale, expireHolds, ticketSla, buyerPaymentDeadlines, siteVisitReminders, previousMonthAdminReports]) {
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
