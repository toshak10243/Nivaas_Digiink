import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { date, futureDate, futureDateTime, number, oneOf, text, email, phone, record, uuid, unitAreas, projectCharges } from '../../src/lib/validate.js';
import { costSheet, emi, scheduleFor } from '../../src/lib/pricing.js';
import { validateSettings } from '../../src/settings.js';

test('number validates required values, ranges, and integer constraints', () => {
  assert.equal(number('10', 'Amount', { min: 1, max: 10, optional: false }), 10);
  assert.throws(() => number('', 'Amount', { optional: false }), /Amount is required/);
  assert.equal(number('   ', 'Amount'), undefined);
  assert.throws(() => number('   ', 'Amount', { optional: false }), /Amount is required/);
  assert.throws(() => number(1.2, 'Count', { integer: true }), /whole number/);
  assert.throws(() => number(11, 'Amount', { max: 10 }), /at most 10/);
  assert.throws(() => number(true, 'Amount'), /must be a number/);
  assert.throws(() => number([], 'Amount'), /must be a number/);
  assert.throws(() => number('0x10', 'Amount'), /must be a number/);
  assert.throws(() => number('1e3', 'Amount'), /must be a number/);
  assert.throws(() => number(Number.NaN, 'Amount'), /must be a number/);
});

test('date and enum validators reject invalid input', () => {
  assert.equal(date('2026-01-02', 'Date'), '2026-01-02T00:00:00.000Z');
  assert.equal(date('2024-02-29', 'Date'), '2024-02-29T00:00:00.000Z');
  assert.equal(date('2026-01-02T10:30:00+05:30', 'Date'), '2026-01-02T05:00:00.000Z');
  assert.throws(() => date('not-a-date', 'Date'), /valid ISO date/);
  assert.throws(() => date('2026-02-30', 'Date'), /valid ISO date/);
  assert.throws(() => date('2025-02-29', 'Date'), /valid ISO date/);
  assert.throws(() => date('2026-13-01', 'Date'), /valid ISO date/);
  assert.throws(() => date('2026-01-02T25:00', 'Date'), /valid ISO date/);
  assert.throws(() => date(1_767_312_000_000, 'Date'), /valid ISO date/);
  assert.throws(() => date('   ', 'Date', { optional: false }), /Date is required/);
  assert.equal(futureDate('2026-11-18T10:00:00Z', 'Visit date', Date.parse('2026-11-17T10:00:00Z')), '2026-11-18T10:00:00.000Z');
  assert.throws(() => futureDate('2026-11-17T10:00:00Z', 'Visit date', Date.parse('2026-11-17T10:00:00Z')), /must be in the future/);
  assert.equal(futureDateTime('2026-11-18T10:00:00+05:30', 'Visit date', Date.parse('2026-11-17T10:00:00Z')), '2026-11-18T04:30:00.000Z');
  assert.throws(() => futureDateTime('2026-11-18', 'Visit date'), /include a time and timezone/);
  assert.equal(oneOf('urgent', 'Priority', ['normal', 'urgent']), 'urgent');
  assert.throws(() => oneOf('critical', 'Priority', ['normal', 'urgent']), /must be one of/);
});

test('account input validators normalize and reject malformed values', () => {
  assert.equal(text('  Vikram  ', 'Name', { optional: false }), 'Vikram');
  assert.equal(email(' Admin@Example.com ', 'Email', { optional: false }), 'admin@example.com');
  assert.equal(phone('+91 98290-12345'), '+91 98290-12345');
  assert.throws(() => text('   ', 'Name', { optional: false }), /Name is required/);
  assert.throws(() => email('not-an-email', 'Email', { optional: false }), /valid email/);
  assert.throws(() => phone('123'), /valid phone/);
  assert.throws(() => phone({ number: '1234567890' }), /must be text/);
  assert.throws(() => record([], 'Profile'), /must be an object/);
  assert.equal(uuid('123e4567-e89b-42d3-a456-426614174000'), '123e4567-e89b-42d3-a456-426614174000');
  assert.throws(() => uuid('not-an-id'), /valid ID/);
});

test('organization settings accept known values and reject unknown or out-of-range values', () => {
  assert.deepEqual(validateSettings({ routing: { strategy: 'round_robin', include_brokers: true }, emi: { rate: 8.5 } }), {
    routing: { strategy: 'round_robin', include_brokers: true }, emi: { rate: 8.5 }
  });
  assert.throws(() => validateSettings({ routing: { target_all: true } }), /Unknown setting/);
  assert.throws(() => validateSettings({ emi: { rate: 101 } }), /from 0 to 100/);
  assert.throws(() => validateSettings({ holds: { hours: '48' } }), /must be a number/);
  assert.throws(() => validateSettings({ extra: { foo: true } }), /Unknown or invalid settings section/);
});

test('unit areas require realistic carpet, built-up, and super built-up ordering', () => {
  assert.deepEqual(unitAreas({ carpet_sqft: '900', builtup_sqft: 1100, super_sqft: 1350 }), { carpet_sqft: 900, builtup_sqft: 1100, super_sqft: 1350 });
  assert.throws(() => unitAreas({ carpet_sqft: 1000, builtup_sqft: 900, super_sqft: 1200 }), /Built-up area cannot be smaller/);
  assert.throws(() => unitAreas({ carpet_sqft: 900, builtup_sqft: 1100, super_sqft: 1000 }), /Super built-up area cannot be smaller/);
  assert.throws(() => unitAreas({ carpet_sqft: true, builtup_sqft: 1100, super_sqft: 1300 }), /must be a number/);
});

test('project charges allow supported fields and enforce value ranges', () => {
  assert.deepEqual(projectCharges({ parking: '250000', registry_pct: 7.5, stamp_pct: 6 }), { parking: 250000, registry_pct: 7.5, stamp_pct: 6 });
  assert.throws(() => projectCharges({ gst_pct: 5 }), /Unknown charge/);
  assert.throws(() => projectCharges({ registry_pct: 100.1 }), /at most 100/);
  assert.throws(() => projectCharges({ parking: -1 }), /at least 0/);
});

test('cost sheet and payment schedule calculate expected totals', () => {
  const project = { rate_sqft: 2500, charges: { parking: 20_000, club: 10_000, maintenance_deposit: 5_000, registry_pct: 7.5, stamp_pct: 2, registration: 30_000 } };
  const type = { super_sqft: 100, payment_plan: [{ milestone: 'Booking', pct: 10 }, { milestone: 'Possession', pct: 90 }] };
  const sheet = costSheet(project, type, { plc_pct: 2 });
  assert.equal(sheet.base, 250_000);
  assert.equal(sheet.plc, 5_000);
  assert.equal(sheet.registry, 21_375);
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
