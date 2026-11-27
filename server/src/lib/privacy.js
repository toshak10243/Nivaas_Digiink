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

/** Remove buyer contact details from broker-facing CRM responses. */
export function protectCustomerFields(row, role, phoneField = 'phone', emailField = 'email') {
  if (role !== 'broker' || !row) return row;
  const protectedRow = maskPhoneField(row, phoneField, role);
  if (Object.hasOwn(protectedRow, emailField)) protectedRow[emailField] = null;
  return protectedRow;
}

export function protectCustomerRows(rows, role, phoneField = 'phone', emailField = 'email') {
  return role === 'broker' ? rows.map(row => protectCustomerFields(row, role, phoneField, emailField)) : rows;
}
