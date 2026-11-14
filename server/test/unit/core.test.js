import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { date, number, oneOf } from '../../src/lib/validate.js';
import { costSheet, emi, scheduleFor } from '../../src/lib/pricing.js';

test('number validates required values, ranges, and integer constraints', () => {
  assert.equal(number('10', 'Amount', { min: 1, max: 10, optional: false }), 10);
  assert.throws(() => number('', 'Amount', { optional: false }), /Amount is required/);
  assert.throws(() => number(1.2, 'Count', { integer: true }), /whole number/);
  assert.throws(() => number(11, 'Amount', { max: 10 }), /at most 10/);
});

test('date and enum validators reject invalid input', () => {
  assert.equal(date('2026-01-02', 'Date'), '2026-01-02T00:00:00.000Z');
  assert.throws(() => date('not-a-date', 'Date'), /valid date/);
  assert.equal(oneOf('urgent', 'Priority', ['normal', 'urgent']), 'urgent');
  assert.throws(() => oneOf('critical', 'Priority', ['normal', 'urgent']), /must be one of/);
});

test('cost sheet and payment schedule calculate expected totals', () => {
  const project = { rate_sqft: 2500, charges: { parking: 20_000, club: 10_000, maintenance_deposit: 5_000, stamp_pct: 2, registration: 30_000 } };
  const type = { super_sqft: 100, payment_plan: [{ milestone: 'Booking', pct: 10 }, { milestone: 'Possession', pct: 90 }] };
  const sheet = costSheet(project, type, { plc_pct: 2 });
  assert.equal(sheet.base, 250_000);
  assert.equal(sheet.plc, 5_000);
  assert.equal(sheet.registry_pct, 7.5);
  assert.equal(sheet.registry, 21_375); // 7.5% of base + PLC + parking + club
  assert.equal(sheet.total, 311_375);
  assert.equal(sheet.all_in, 346_475);
  assert.deepEqual(scheduleFor(type, 100_000).map(x => x.amount), [10_000, 90_000]);
});

test('EMI handles zero interest and standard monthly compounding', () => {
  assert.equal(emi(120_000, 0, 10), 1000);
  assert.equal(emi(0, 8, 20), 0);
  assert.equal(emi(1_000_000, 12, 1), 88_849);
});

test('WhatsApp webhook signature verification accepts only the matching HMAC', async () => {
  process.env.META_APP_SECRET = 'unit-test-meta-secret';
  const { verifySignature } = await import('../../src/services/meta.js');
  const body = Buffer.from('{"entry":[]}');
  const signature = `sha256=${createHmac('sha256', process.env.META_APP_SECRET).update(body).digest('hex')}`;
  assert.equal(verifySignature(body, signature), true);
  assert.equal(verifySignature(body, `${signature}x`), false);
  assert.equal(verifySignature(body, undefined), false);
});
