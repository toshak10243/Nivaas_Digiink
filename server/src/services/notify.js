import { one, many } from '../db.js';

/** In-app notification. userId null → every admin of the org. */
export async function notify(orgId, userId, kind, body, link = null) {
  if (userId) return one(`INSERT INTO notifications (org_id, user_id, kind, body, link) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [orgId, userId, kind, body, link]);
  const admins = await many(`SELECT id FROM users WHERE org_id = $1 AND role = 'admin' AND active`, [orgId]);
  for (const a of admins) await one(`INSERT INTO notifications (org_id, user_id, kind, body, link) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [orgId, a.id, kind, body, link]);
}

/** Alert active admins about a provider failure, throttled to one identical notice per admin per 15 minutes. */
export async function notifyAdminsOnce(orgId, kind, body, link = null) {
  const admins = await many(`SELECT id FROM users WHERE org_id = $1 AND role = 'admin' AND active`, [orgId]);
  const message = String(body || '').slice(0, 500);
  for (const admin of admins) {
    const recent = await one(`SELECT id FROM notifications WHERE org_id = $1 AND user_id = $2 AND kind = $3 AND body = $4 AND created_at > now() - interval '15 minutes' LIMIT 1`,
      [orgId, admin.id, kind, message]);
    if (!recent) await one(`INSERT INTO notifications (org_id, user_id, kind, body, link) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [orgId, admin.id, kind, message, link]);
  }
}

export async function logLead(leadId, actorId, kind, body) {
  await one(`INSERT INTO lead_events (lead_id, actor_id, kind, body) VALUES ($1,$2,$3,$4) RETURNING id`, [leadId, actorId || null, kind, body]);
  await one(`UPDATE leads SET updated_at = now() WHERE id = $1 RETURNING id`, [leadId]);
}
