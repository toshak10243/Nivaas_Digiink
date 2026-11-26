const DAY_MS = 24 * 60 * 60 * 1000;
const CLOSED_STAGES = new Set(['booked', 'lost']);
const clean = value => typeof value === 'string' && value.trim().length > 0;

/** Explainable lead prioritization based on captured CRM signals. */
export function prioritizeLead(lead, now = Date.now()) {
  if (CLOSED_STAGES.has(lead.stage)) {
    return { priority_score: 0, priority_level: 'closed', priority_reasons: [], recommended_action: 'No follow-up needed' };
  }

  let score = 0;
  const reasons = [];
  const add = (points, reason) => { score += points; reasons.push(reason); };
  if (lead.temperature === 'hot') add(22, 'Marked hot');
  else if (lead.temperature === 'warm') add(12, 'Marked warm');
  else add(4, 'Marked cold');

  const stagePoints = { new: 5, contacted: 8, qualified: 14, visit_scheduled: 20, visit_done: 20, negotiation: 24 }[lead.stage] || 0;
  if (stagePoints) add(stagePoints, 'Active sales stage');
  if (clean(lead.budget)) add(10, 'Budget captured');
  if (clean(lead.config_pref)) add(12, 'Flat preference captured');
  if (lead.project_id) add(4, 'Project selected');

  const lastCustomerAt = Date.parse(lead.last_customer_message_at || '');
  const customerAge = now - lastCustomerAt;
  if (Number.isFinite(lastCustomerAt) && customerAge <= 7 * DAY_MS) add(18, 'Customer recently messaged');
  else if (Number.isFinite(lastCustomerAt) && customerAge <= 30 * DAY_MS) add(10, 'Customer recently messaged');
  const shareViews = Number(lead.recent_share_views) || 0;
  if (shareViews > 0) add(Math.min(12, shareViews * 4), 'Viewed shared property details');

  const dueAt = Date.parse(lead.followup_at || '');
  if (Number.isFinite(dueAt) && dueAt < now) add(18, 'Follow-up overdue');
  else if (Number.isFinite(dueAt) && dueAt <= now + DAY_MS) add(10, 'Follow-up due today');

  const scoreValue = Math.min(100, score);
  const actionByStage = {
    new: 'Call the customer and confirm their requirements',
    contacted: 'Share matching homes and agree on a follow-up time',
    qualified: 'Send a shortlist that fits the budget and flat preference',
    visit_scheduled: 'Confirm the visit time, location, and travel plan',
    visit_done: 'Record visit feedback and agree on the next step',
    negotiation: 'Follow up on the offer and resolve open questions',
  };
  return {
    priority_score: scoreValue,
    priority_level: scoreValue >= 60 ? 'high' : scoreValue >= 35 ? 'medium' : 'low',
    priority_reasons: reasons,
    recommended_action: (clean(lead.followup_note) ? lead.followup_note.trim() : null)
      || actionByStage[lead.stage] || 'Review the lead and schedule a follow-up',
  };
}
