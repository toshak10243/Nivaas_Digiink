// One place that turns a unit into money. The client has the same file (client/src/lib/pricing.js).
export function costSheet(project, type, unit) {
  const c = project.charges || {};
  const sqft = Number(type?.super_sqft || 0);
  const rate = Number(project.rate_sqft || 0);
  const base = unit?.price_override ? Number(unit.price_override) : sqft * rate;
  const plc = unit?.price_override ? 0 : Math.round(base * (Number(unit?.plc_pct || 0) / 100));
  const parking = Number(c.parking || 0);
  const club = Number(c.club || 0);
  const deposit = Number(c.maintenance_deposit || 0);
  const registry_pct = Number(c.registry_pct ?? 7.5);
  const registry = Math.round((base + plc + parking + club) * (registry_pct / 100));
  const total = Math.round(base + plc + parking + club + deposit + registry);
  const stamp = Math.round((base + plc) * (Number(c.stamp_pct || 0) / 100));
  const registration = Number(c.registration || 0);
  return { sqft, rate, base: Math.round(base), plc, parking, club, deposit, registry, registry_pct,
    total, stamp, stamp_pct: Number(c.stamp_pct || 0), registration, all_in: total + stamp + registration };
}

/** Monthly EMI for a loan. rate = annual % */
export function emi(principal, rate, years) {
  const r = rate / 12 / 100, n = years * 12;
  if (!principal || !n) return 0;
  if (!r) return Math.round(principal / n);
  return Math.round((principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1));
}

/** Booking payment schedule from the project's payment plan. */
export function scheduleFor(project, dealValue) {
  const plan = project.payment_plan?.length ? project.payment_plan : [{ milestone: 'On booking', pct: 10 }, { milestone: 'On agreement', pct: 20 }, { milestone: 'On possession', pct: 70 }];
  return plan.map(p => ({ milestone: p.milestone, pct: Number(p.pct), amount: Math.round(dealValue * Number(p.pct) / 100), due: p.due || null }));
}

export const inr = n => '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN');
