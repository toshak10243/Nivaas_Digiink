import test from 'node:test';
import assert from 'node:assert/strict';
import { prioritizeLead } from '../../../shared/lead-priority.js';
import { eligibleAssignees } from '../../src/lib/lead-routing.js';

const now = Date.parse('2026-11-26T12:00:00.000Z');

test('priority score accounts for interest, stage, captured needs, engagement, and overdue follow-up', () => {
  const result = prioritizeLead({
    stage: 'negotiation', temperature: 'hot', project_id: 'project-1', budget: '₹80–90 L', config_pref: '3 BHK',
    last_customer_message_at: new Date(now - 2 * 864e5).toISOString(), recent_share_views: 4,
    followup_at: new Date(now - 3600e3).toISOString(),
  }, now);

  assert.equal(result.priority_score, 100);
  assert.equal(result.priority_level, 'high');
  assert.deepEqual(result.priority_reasons, [
    'Marked hot', 'Active sales stage', 'Budget captured', 'Flat preference captured', 'Project selected',
    'Customer recently messaged', 'Viewed shared property details', 'Follow-up overdue',
  ]);
  assert.equal(result.recommended_action, 'Follow up on the offer and resolve open questions');
});

test('priority tiers and recommended follow-up note are deterministic', () => {
  const medium = prioritizeLead({ stage: 'qualified', temperature: 'warm', budget: '₹70 L', config_pref: '2 BHK' }, now);
  assert.equal(medium.priority_score, 48);
  assert.equal(medium.priority_level, 'medium');
  assert.equal(medium.recommended_action, 'Send a shortlist that fits the budget and flat preference');

  const low = prioritizeLead({ stage: 'new', temperature: 'cold' }, now);
  assert.equal(low.priority_level, 'low');
  assert.equal(low.recommended_action, 'Call the customer and confirm their requirements');

  const custom = prioritizeLead({ stage: 'qualified', temperature: 'warm', followup_note: 'Send the cost sheet' }, now);
  assert.equal(custom.recommended_action, 'Send the cost sheet');
});

test('closed leads do not receive follow-up priority', () => {
  assert.deepEqual(prioritizeLead({ stage: 'booked', temperature: 'hot', budget: '₹1 Cr' }, now), {
    priority_score: 0,
    priority_level: 'closed',
    priority_reasons: [],
    recommended_action: 'No follow-up needed',
  });
});

test('assignment prefers available people and honors exclusions', () => {
  const candidates = [
    { id: 'busy', profile: { availability: 'busy', ai_twin: { mode: 'always' } } },
    { id: 'available', profile: { availability: 'available' } },
    { id: 'away', profile: { availability: 'away', ai_twin: { mode: 'always' } } },
  ];
  assert.deepEqual(eligibleAssignees(candidates).map(person => person.id), ['available']);
  assert.deepEqual(eligibleAssignees(candidates, { exclude: ['available'] }).map(person => person.id), ['busy', 'away']);
});

test('assignment uses AI-covered people only when no one is available', () => {
  const candidates = [
    { id: 'busy', profile: { availability: 'busy', ai_twin: { mode: 'always' } } },
    { id: 'away-off', profile: { availability: 'away', ai_twin: { mode: 'off' } } },
  ];
  assert.deepEqual(eligibleAssignees(candidates).map(person => person.id), ['busy']);
  assert.deepEqual(eligibleAssignees(candidates, { exclude: ['busy'] }), []);
  assert.equal(eligibleAssignees(candidates, { respectAvailability: false }).length, 2);
});
