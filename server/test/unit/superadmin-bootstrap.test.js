import test from 'node:test';
import assert from 'node:assert/strict';
import { initialSuperAdminCredentials } from '../../src/lib/superadmin-bootstrap.js';

test('super-admin bootstrap accepts a valid one-time credential set', () => {
  assert.deepEqual(initialSuperAdminCredentials({
    SUPERADMIN_INITIAL_NAME: ' Platform Owner ',
    SUPERADMIN_INITIAL_EMAIL: ' OWNER@EXAMPLE.COM ',
    SUPERADMIN_INITIAL_PASSWORD: 'a-unique-bootstrap-password',
  }), {
    name: 'Platform Owner',
    email: 'owner@example.com',
    password: 'a-unique-bootstrap-password',
  });
});

test('super-admin bootstrap refuses missing, malformed, or weak credentials', () => {
  assert.throws(() => initialSuperAdminCredentials({}), /SUPERADMIN_INITIAL_NAME/);
  assert.throws(() => initialSuperAdminCredentials({
    SUPERADMIN_INITIAL_NAME: 'Owner',
    SUPERADMIN_INITIAL_EMAIL: 'bad-email',
    SUPERADMIN_INITIAL_PASSWORD: 'a-unique-bootstrap-password',
  }), /SUPERADMIN_INITIAL_EMAIL/);
  assert.throws(() => initialSuperAdminCredentials({
    SUPERADMIN_INITIAL_NAME: 'Owner',
    SUPERADMIN_INITIAL_EMAIL: 'owner@example.com',
    SUPERADMIN_INITIAL_PASSWORD: 'short',
  }), /SUPERADMIN_INITIAL_PASSWORD/);
});
