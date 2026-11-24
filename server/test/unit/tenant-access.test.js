import test from 'node:test';
import assert from 'node:assert/strict';
import { clearTenantCache, getTenantIdentifier, tenantResolver } from '../../src/middleware/tenant-resolver.js';
import { masterDb } from '../../src/lib/tenant-db.js';
import { subscriptionGuard } from '../../src/middleware/subscription-guard.js';

const future = new Date(Date.now() + 60_000).toISOString();
const past = new Date(Date.now() - 60_000).toISOString();

function runGuard(tenant, method = 'POST') {
  const req = { tenant, method, path: '/records' };
  let status = 200;
  let body;
  let nextCalled = false;
  const res = {
    status(value) { status = value; return this; },
    json(value) { body = value; return this; },
  };
  subscriptionGuard(req, res, () => { nextCalled = true; });
  return { status, body, nextCalled };
}

test('tenant resolver identifies subdomains, custom domains, and explicit API tenant selectors', () => {
  assert.deepEqual(getTenantIdentifier({ headers: { host: 'apex.nivaas.space:4100' }, query: {} }, 'nivaas.space'), {
    slug: 'apex', source: 'host',
  });
  assert.deepEqual(getTenantIdentifier({ headers: { host: 'crm.apexbuilders.com' }, query: {} }, 'nivaas.space'), {
    slug: 'crm.apexbuilders.com', source: 'custom-domain',
  });
  assert.deepEqual(getTenantIdentifier({ headers: { host: 'localhost:4100', 'x-tenant-slug': 'sales-team' }, query: {} }, 'nivaas.space'), {
    slug: 'sales-team', source: 'header',
  });
  assert.deepEqual(getTenantIdentifier({ headers: { host: 'nivaas.space' }, query: {} }, 'nivaas.space'), {
    slug: null, source: null,
  });
});

test('tenant resolver fails closed for an unknown explicit tenant instead of using the default database', async () => {
  const originalLookup = masterDb.one;
  masterDb.one = async () => null;
  clearTenantCache();
  const req = { headers: { host: 'localhost:4100', 'x-tenant-slug': 'missing-tenant' }, query: {} };
  let status;
  let body;
  let nextCalled = false;
  const res = {
    status(value) { status = value; return this; },
    json(value) { body = value; return this; },
  };
  try {
    await tenantResolver(req, res, () => { nextCalled = true; });
  } finally {
    masterDb.one = originalLookup;
    clearTenantCache();
  }
  assert.equal(status, 404);
  assert.equal(body.error, 'Tenant not found');
  assert.equal(nextCalled, false);
});

test('tenant resolver reports master database lookup failures instead of falling back', async () => {
  const originalLookup = masterDb.one;
  masterDb.one = async () => { throw new Error('master database unavailable'); };
  clearTenantCache();
  const req = { headers: { host: 'missing.nivaas.space' }, query: {} };
  let status;
  let body;
  let nextCalled = false;
  const res = {
    status(value) { status = value; return this; },
    json(value) { body = value; return this; },
  };
  try {
    await tenantResolver(req, res, () => { nextCalled = true; });
  } finally {
    masterDb.one = originalLookup;
    clearTenantCache();
  }
  assert.equal(status, 503);
  assert.equal(body.error, 'Tenant lookup is temporarily unavailable');
  assert.equal(nextCalled, false);
});

test('subscription guard permits writes for active unexpired tenants', () => {
  assert.equal(runGuard({ subscription_status: 'active', subscription_ends_at: future }).nextCalled, true);
});

test('subscription guard blocks writes for expired active tenants', () => {
  const result = runGuard({ subscription_status: 'active', plan_type: 'monthly', subscription_ends_at: past });
  assert.equal(result.status, 402);
  assert.equal(result.body.code, 'SUBSCRIPTION_EXPIRED');
  assert.equal(result.nextCalled, false);
});

test('subscription guard blocks writes for inactive tenants before expiry', () => {
  const result = runGuard({ subscription_status: 'pending_verification', subscription_ends_at: future });
  assert.equal(result.status, 402);
  assert.equal(result.nextCalled, false);
});

test('subscription guard blocks missing or malformed expiry dates for active non-lifetime plans', () => {
  for (const expiry of [null, 'not-a-date']) {
    const result = runGuard({ subscription_status: 'active', plan_type: 'monthly', subscription_ends_at: expiry });
    assert.equal(result.status, 402);
    assert.equal(result.nextCalled, false);
  }
});

test('subscription guard allows lifetime plan writes and read-only access after expiry', () => {
  assert.equal(runGuard({ subscription_status: 'active', plan_type: 'lifetime', subscription_ends_at: past }).nextCalled, true);
  assert.equal(runGuard({ subscription_status: 'suspended', subscription_ends_at: past }, 'GET').nextCalled, true);
});
