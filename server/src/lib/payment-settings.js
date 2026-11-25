const PAYMENT_FIELDS = [
  'upi_id', 'bank_name', 'account_name', 'account_number', 'ifsc_code',
  'support_phone', 'support_email', 'payment_details_verified',
];

const invalid = message => { throw Object.assign(new Error(message), { status: 400 }); };

export function validatePaymentSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('Payment settings must be an object');
  if (Object.keys(value).some(key => !PAYMENT_FIELDS.includes(key))) invalid('Unsupported payment setting');
  const result = {};
  for (const [key, label, max] of [
    ['upi_id', 'UPI ID', 120], ['bank_name', 'Bank name', 120], ['account_name', 'Beneficiary name', 160],
    ['account_number', 'Account number', 34], ['ifsc_code', 'IFSC code', 11],
    ['support_phone', 'Support phone', 40], ['support_email', 'Support email', 254],
  ]) {
    const raw = value[key] ?? '';
    if (typeof raw !== 'string') invalid(`${label} must be text`);
    result[key] = raw.trim();
    if (result[key].length > max) invalid(`${label} must be at most ${max} characters`);
  }
  result.ifsc_code = result.ifsc_code.toUpperCase();
  if (value.payment_details_verified !== undefined && typeof value.payment_details_verified !== 'boolean') {
    invalid('Payment details confirmation must be true or false');
  }
  result.payment_details_verified = value.payment_details_verified === true;

  if (result.support_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.support_email)) invalid('Enter a valid support email');
  if (result.support_phone && !/^\+?[\d\s().-]{7,40}$/.test(result.support_phone)) invalid('Enter a valid support phone');
  if (result.payment_details_verified && !isPaymentSettingsReady(result)) {
    invalid('Enter a valid UPI ID, beneficiary, bank, account number, and IFSC before confirming payment details');
  }
  return result;
}

export function isPaymentSettingsReady(settings) {
  return settings?.payment_details_verified === true
    && typeof settings.upi_id === 'string' && /^[^\s@]+@[^\s@]+$/.test(settings.upi_id)
    && typeof settings.account_name === 'string' && settings.account_name.trim().length > 1
    && typeof settings.bank_name === 'string' && settings.bank_name.trim().length > 1
    && typeof settings.account_number === 'string' && /^\d{6,34}$/.test(settings.account_number)
    && typeof settings.ifsc_code === 'string' && /^[A-Z]{4}0[A-Z0-9]{6}$/.test(settings.ifsc_code.toUpperCase());
}

export function paymentMethodsFromSettings(settings) {
  if (!isPaymentSettingsReady(settings)) return null;
  return {
    upi: { upiId: settings.upi_id, payeeName: settings.account_name },
    bank: {
      accountName: settings.account_name,
      bankName: settings.bank_name,
      accountNumber: settings.account_number,
      ifscCode: settings.ifsc_code.toUpperCase(),
    },
  };
}
