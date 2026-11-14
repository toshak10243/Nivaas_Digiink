const bad = message => { throw Object.assign(new Error(message), { status: 400 }); };

export function number(value, label, { min = -Infinity, max = Infinity, integer = false, optional = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return undefined;
    return bad(`${label} is required`);
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) {
    const range = `${Number.isFinite(min) ? `at least ${min}` : ''}${Number.isFinite(min) && Number.isFinite(max) ? ' and ' : ''}${Number.isFinite(max) ? `at most ${max}` : ''}`;
    return bad(`${label} must be a ${integer ? 'whole number' : 'number'}${range ? ' ' + range : ''}`);
  }
  return n;
}

export function date(value, label, { optional = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return undefined;
    return bad(`${label} is required`);
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return bad(`${label} must be a valid date`);
  return d.toISOString();
}

export function oneOf(value, label, choices, { optional = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return undefined;
    return bad(`${label} is required`);
  }
  if (!choices.includes(value)) return bad(`${label} must be one of: ${choices.join(', ')}`);
  return value;
}
