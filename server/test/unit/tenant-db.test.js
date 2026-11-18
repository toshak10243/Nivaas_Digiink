import test from 'node:test';
import assert from 'node:assert/strict';
import { tenantStorage, runWithTenant, getActivePool, defaultPool } from '../../src/lib/tenant-db.js';
import { q, one } from '../../src/db.js';

test('tenant-db defaults to default pool outside tenant context', () => {
  const currentPool = getActivePool();
  assert.equal(currentPool, defaultPool, 'Should use defaultPool when no tenant is set');
});

test('runWithTenant sets tenant context in AsyncLocalStorage', async () => {
  const mockTenant = { slug: 'testtenant', db_name: 'nivaas_testtenant' };
  
  await runWithTenant(mockTenant, async () => {
    const store = tenantStorage.getStore();
    assert.ok(store, 'Store should exist');
    assert.equal(store.tenant.slug, 'testtenant');
    assert.equal(store.tenant.db_name, 'nivaas_testtenant');
  });

  // After exiting runWithTenant, context should be cleared
  assert.equal(tenantStorage.getStore(), undefined, 'Store should be cleared outside runWithTenant');
});

