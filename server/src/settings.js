// Org-level settings with defaults. Stored in orgs.settings, merged on read.
export const DEFAULTS = {
  routing: {
    // when a lead is handed to a person:  'qualified' = after the AI qualifies it, 'immediately' = as soon as it arrives
    assign_on: 'qualified',
    // who gets it: 'round_robin' | 'least_loaded'
    strategy: 'least_loaded',
    include_brokers: false,         // brokers can also receive builder-sourced leads
    first_response_min: 15,          // assignee (or their AI twin) must respond within this, else reassign
    respect_availability: true,      // skip agents marked "away"
  },
  tickets: { sla_hours: 24, urgent_sla_hours: 6, notify_sales_agent: true },
  holds: { hours: 48 },              // how long a unit hold lasts
  booking: { default_booking_pct: 10 },
  emi: { rate: 8.6, tenure_years: 20, down_pct: 20 },
};

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
export function merge(base, over) {
  if (!isObj(over)) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = isObj(v) && isObj(base[k]) ? merge(base[k], v) : v;
  return out;
}
export const settingsOf = org => merge(DEFAULTS, org?.settings || {});
