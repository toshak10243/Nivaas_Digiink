import test from 'node:test';
import assert from 'node:assert/strict';
import { isPaymentSettingsReady, paymentMethodsFromSettings, validatePaymentSettings } from '../../src/lib/payment-settings.js';

const valid = {
  upi_id: 'nivaas.operations@icici',
  bank_name: 'Example Bank',
  account_name: 'Nivaas Operations Private Limited',
  account_number: '123456789012',
  ifsc_code: 'ABCD0123456',
  support_phone: '+91 98290 12345',
  support_email: 'billing@example.com',
  payment_details_verified: true,
};

test('payment destinations stay hidden until an admin verifies valid UPI and bank details', () => {
  assert.equal(isPaymentSettingsReady({ ...valid, payment_details_verified: false }), false);
  assert.equal(paymentMethodsFromSettings({ ...valid, payment_details_verified: false }), null);
  assert.deepEqual(paymentMethodsFromSettings(valid), {
    upi: { upiId: valid.upi_id, payeeName: valid.account_name },
    bank: { accountName: valid.account_name, bankName: valid.bank_name, accountNumber: valid.account_number, ifscCode: valid.ifsc_code },
  });
});

test('verified payment settings reject malformed destinations and unsupported properties', () => {
  assert.throws(() => validatePaymentSettings({ ...valid, upi_id: 'invalid' }), /valid UPI ID/);
  assert.throws(() => validatePaymentSettings({ ...valid, ifsc_code: 'bad-ifsc' }), /valid UPI ID.*IFSC/);
  assert.throws(() => validatePaymentSettings({ ...valid, support_email: 'bad-email' }), /valid support email/);
  assert.throws(() => validatePaymentSettings({ ...valid, secret: 'unexpected' }), /Unsupported payment setting/);
  assert.equal(validatePaymentSettings({ ...valid, ifsc_code: 'abcd0123456' }).ifsc_code, 'ABCD0123456');
});
