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

// Validate partial settings updates before merging them into persisted org data.
export function validateSettings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Object.assign(new Error('Settings must be an object'), { status: 400 });
  const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
  const out = {};
  const enums = { 'routing.assign_on': ['qualified', 'immediately'], 'routing.strategy': ['least_loaded', 'round_robin'] };
  const ranges = {
    'routing.first_response_min': [1, 1440], 'tickets.sla_hours': [1, 720], 'tickets.urgent_sla_hours': [1, 720],
    'holds.hours': [1, 720], 'booking.default_booking_pct': [0, 100], 'emi.rate': [0, 100],
    'emi.tenure_years': [1, 50], 'emi.down_pct': [0, 100]
  };
  for (const [section, values] of Object.entries(input)) {
    if (!Object.hasOwn(DEFAULTS, section) || !values || typeof values !== 'object' || Array.isArray(values)) fail(`Unknown or invalid settings section: ${section}`);
    out[section] = {};
    for (const [key, value] of Object.entries(values)) {
      const path = `${section}.${key}`;
      if (!Object.hasOwn(DEFAULTS[section], key)) fail(`Unknown setting: ${path}`);
      if (enums[path]) {
        if (!enums[path].includes(value)) fail(`${path} must be one of: ${enums[path].join(', ')}`);
        out[section][key] = value;
      } else if (ranges[path]) {
        const [min, max] = ranges[path];
        if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(`${path} must be a number from ${min} to ${max}`);
        out[section][key] = value;
      } else if (typeof DEFAULTS[section][key] === 'boolean') {
        if (typeof value !== 'boolean') fail(`${path} must be true or false`);
        out[section][key] = value;
      } else fail(`Unsupported setting: ${path}`);
    }
  }
  return out;
}
