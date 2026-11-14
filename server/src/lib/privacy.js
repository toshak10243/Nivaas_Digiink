export function maskPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits ? `\u2022\u2022\u2022\u2022\u2022\u2022${digits.slice(-4)}` : '';
}

export function maskPhoneField(row, field, role) {
  return role === 'broker' && row?.[field] ? { ...row, [field]: maskPhone(row[field]) } : row;
}

export function maskPhoneRows(rows, field, role) {
  return role === 'broker' ? rows.map(row => maskPhoneField(row, field, role)) : rows;
}
