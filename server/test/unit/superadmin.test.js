import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { requireSuperAdmin } from '../../src/routes/superadmin.js';
import { config } from '../../src/config.js';

test('requireSuperAdmin middleware rejects missing token', () => {
  const req = { get: () => null, query: {} };
  let status = null;
  let jsonBody = null;
  const res = {
    status: (s) => { status = s; return res; },
    json: (b) => { jsonBody = b; return res; },
  };
  let calledNext = false;
  requireSuperAdmin(req, res, () => { calledNext = true; });

  assert.equal(status, 401);
  assert.equal(jsonBody.code, 'SUPERADMIN_AUTH_REQUIRED');
  assert.equal(calledNext, false);
});

test('requireSuperAdmin middleware rejects non-superadmin token', () => {
  const token = jwt.sign({ id: 1, role: 'admin' }, config.jwtSecret);
  const req = { get: () => `Bearer ${token}`, query: {} };
  let status = null;
  let jsonBody = null;
  const res = {
    status: (s) => { status = s; return res; },
    json: (b) => { jsonBody = b; return res; },
  };
  let calledNext = false;
  requireSuperAdmin(req, res, () => { calledNext = true; });

  assert.equal(status, 403);
  assert.equal(jsonBody.code, 'FORBIDDEN');
  assert.equal(calledNext, false);
});

test('requireSuperAdmin middleware passes for valid super_admin token', () => {
  const token = jwt.sign({ id: 99, email: 'admin@nivaas.space', role: 'super_admin' }, config.jwtSecret);
  const req = { get: () => `Bearer ${token}`, query: {} };
  let calledNext = false;
  const res = {};
  requireSuperAdmin(req, res, () => { calledNext = true; });

  assert.equal(calledNext, true);
  assert.equal(req.superAdmin.id, 99);
  assert.equal(req.superAdmin.email, 'admin@nivaas.space');
});
