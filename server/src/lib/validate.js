const bad = message => { throw Object.assign(new Error(message), { status: 400 }); };

export function text(value, label, { optional = true, max = 160, trim = true } = {}) {
  if (value === undefined || value === null) {
    if (optional) return undefined;
    return bad(`${label} is required`);
  }
  if (typeof value !== 'string') return bad(`${label} must be text`);
  const result = trim ? value.trim() : value;
  if (!result && !optional) return bad(`${label} is required`);
  if (result.length > max) return bad(`${label} must be at most ${max} characters`);
  return result;
}

export function email(value, label = 'Email', { optional = true } = {}) {
  const result = text(value, label, { optional, max: 254 });
  if (result !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) return bad(`Enter a valid ${label.toLowerCase()}`);
  return result?.toLowerCase();
}

export function phone(value, label = 'Phone', { optional = true } = {}) {
  const result = text(value, label, { optional, max: 40 });
  if (result !== undefined && result !== '') {
    const digits = result.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15 || !/^\+?[\d\s().-]+$/.test(result)) return bad(`Enter a valid ${label.toLowerCase()}`);
  }
  return result;
}

export function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return bad(`${label} must be an object`);
  return value;
}

export function uuid(value, label = 'ID', { optional = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return undefined;
    return bad(`${label} is required`);
  }
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) return bad(`${label} must be a valid ID`);
  return value;
}

export function unitAreas(values) {
  record(values, 'Unit areas');
  const carpet = number(values.carpet_sqft, 'Carpet area', { min: 1, max: 1_000_000, optional: false });
  const builtup = number(values.builtup_sqft, 'Built-up area', { min: 1, max: 1_000_000, optional: false });
  const superBuiltup = number(values.super_sqft, 'Super built-up area', { min: 1, max: 1_000_000, optional: false });
  if (builtup < carpet) bad('Built-up area cannot be smaller than carpet area');
  if (superBuiltup < builtup) bad('Super built-up area cannot be smaller than built-up area');
  return { carpet_sqft: carpet, builtup_sqft: builtup, super_sqft: superBuiltup };
}

export function projectCharges(value) {
  record(value, 'Charges');
  const allowed = ['parking', 'club', 'maintenance_deposit', 'registry_pct', 'stamp_pct', 'registration'];
  const result = {};
  for (const [key, amount] of Object.entries(value)) {
    if (!allowed.includes(key)) bad(`Unknown charge: ${key}`);
    result[key] = number(amount, `Charge ${key}`, { min: 0, max: key.endsWith('_pct') ? 100 : 1_000_000_000, optional: false });
  }
  return result;
}

export function number(value, label, { min = -Infinity, max = Infinity, integer = false, optional = true } = {}) {
  const text = typeof value === 'string' ? value.trim() : null;
  if (value === undefined || value === null || text === '') {
    if (optional) return undefined;
    return bad(`${label} is required`);
  }
  if (typeof value !== 'number' && typeof value !== 'string') return bad(`${label} must be a ${integer ? 'whole number' : 'number'}`);
  if (typeof value === 'string' && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return bad(`${label} must be a ${integer ? 'whole number' : 'number'}`);
  const n = typeof value === 'number' ? value : Number(text);
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) {
    const range = `${Number.isFinite(min) ? `at least ${min}` : ''}${Number.isFinite(min) && Number.isFinite(max) ? ' and ' : ''}${Number.isFinite(max) ? `at most ${max}` : ''}`;
    return bad(`${label} must be a ${integer ? 'whole number' : 'number'}${range ? ' ' + range : ''}`);
  }
  return n;
}

export function date(value, label, { optional = true } = {}) {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    if (optional) return undefined;
    return bad(`${label} is required`);
  }
  if (typeof value !== 'string') return bad(`${label} must be a valid ISO date or date and time`);
  const text = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?)?$/.exec(text);
  if (!match) return bad(`${label} must be a valid ISO date or date and time`);
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , zone] = match;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const hour = Number(hourText || 0), minute = Number(minuteText || 0), second = Number(secondText || 0);
  const daysInMonth = month >= 1 && month <= 12 ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 0;
  if (year < 1000 || day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59) return bad(`${label} must be a valid ISO date or date and time`);
  if (zone && zone !== 'Z') {
    const [offsetHour, offsetMinute] = zone.slice(1).split(':').map(Number);
    if (offsetHour > 23 || offsetMinute > 59) return bad(`${label} must be a valid ISO date or date and time`);
  }
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return bad(`${label} must be a valid date`);
  return d.toISOString();
}

export function futureDate(value, label, now = Date.now()) {
  const normalized = date(value, label, { optional: false });
  if (new Date(normalized).getTime() <= now) return bad(`${label} must be in the future`);
  return normalized;
}

export function futureDateTime(value, label, now = Date.now()) {
  if (typeof value !== 'string' || !/T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value.trim())) return bad(`${label} must include a time and timezone`);
  return futureDate(value, label, now);
}

export function oneOf(value, label, choices, { optional = true } = {}) {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    if (optional) return undefined;
    return bad(`${label} is required`);
  }
  if (!choices.includes(value)) return bad(`${label} must be one of: ${choices.join(', ')}`);
  return value;
}
