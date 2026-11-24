import test from 'node:test';
import assert from 'node:assert/strict';
import { assertDedicatedIntegrationDatabase } from '../lib/integration-db.js';

test('integration database guard accepts clearly named test databases', () => {
  assert.equal(assertDedicatedIntegrationDatabase('postgres://user:pass@localhost:5432/nivaas_test'), 'nivaas_test');
  assert.equal(assertDedicatedIntegrationDatabase('postgres://user:pass@localhost:5432/crm-integration'), 'crm-integration');
});

test('integration database guard rejects missing, malformed, or production-like databases', () => {
  assert.throws(() => assertDedicatedIntegrationDatabase(undefined), /dedicated PostgreSQL database/);
  assert.throws(() => assertDedicatedIntegrationDatabase('not a url'), /valid PostgreSQL connection URL/);
  assert.throws(() => assertDedicatedIntegrationDatabase('postgres://user:pass@localhost:5432/nivaas'), /ends in _test/);
  assert.throws(() => assertDedicatedIntegrationDatabase('postgres://user:pass@localhost:5432/nivaas_prod'), /ends in _test/);
});
