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
  payment: { upi_id: '', account_name: '', bank_name: '', account_number: '', ifsc_code: '', instructions: '', payment_details_verified: false },
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
  const paymentText = { upi_id: 120, account_name: 160, bank_name: 120, account_number: 34, ifsc_code: 11, instructions: 1000 };
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
      } else if (section === 'payment' && Object.hasOwn(paymentText, key)) {
        if (typeof value !== 'string' || value.trim().length > paymentText[key]) fail(`${path} must be text of at most ${paymentText[key]} characters`);
        const clean = value.trim();
        if (key === 'upi_id' && clean && !/^[\w.-]+@[\w.-]+$/.test(clean)) fail('payment.upi_id must be a valid UPI ID');
        if (key === 'account_number' && clean && !/^\d{6,34}$/.test(clean)) fail('payment.account_number must contain 6 to 34 digits');
        if (key === 'ifsc_code' && clean && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(clean.toUpperCase())) fail('payment.ifsc_code must be a valid IFSC code');
        out[section][key] = key === 'ifsc_code' ? clean.toUpperCase() : clean;
      } else if (typeof DEFAULTS[section][key] === 'boolean') {
        if (typeof value !== 'boolean') fail(`${path} must be true or false`);
        out[section][key] = value;
      } else fail(`Unsupported setting: ${path}`);
    }
  }
  if (out.payment?.payment_details_verified === true) {
    const payment = { ...DEFAULTS.payment, ...(input.payment || {}) };
    if (!/^[\w.-]+@[\w.-]+$/.test(payment.upi_id) || payment.account_name.trim().length < 2 || payment.bank_name.trim().length < 2 || !/^\d{6,34}$/.test(payment.account_number) || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(payment.ifsc_code.toUpperCase())) {
      fail('Complete valid UPI and bank details before marking buyer payment instructions as verified');
    }
  }
  return out;
}
