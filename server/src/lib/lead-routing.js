/** Apply availability preferences to a candidate team before workload sorting. */
export function eligibleAssignees(people, { respectAvailability = true, exclude = [] } = {}) {
  let candidates = people.filter(person => !exclude.includes(person.id));
  if (!respectAvailability) return candidates;

  const available = candidates.filter(person => (person.profile?.availability || 'available') === 'available');
  if (available.length) return available;
  return candidates.filter(person => (person.profile?.availability || 'available') !== 'available'
    && person.profile?.ai_twin?.mode && person.profile.ai_twin.mode !== 'off');
}
