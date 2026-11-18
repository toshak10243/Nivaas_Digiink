import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSlug, generateTempPassword } from '../../src/services/tenant-provisioner.js';

test('validateSlug normalizes valid slugs', () => {
  assert.equal(validateSlug('Apex-Builders'), 'apex-builders');
  assert.equal(validateSlug('  shreeganesh  '), 'shreeganesh');
  assert.equal(validateSlug('lotus-group-99'), 'lotus-group-99');
});

test('validateSlug rejects invalid or reserved slugs', () => {
  assert.throws(() => validateSlug('ab'), /between 3 and 30/);
  assert.throws(() => validateSlug('a'.repeat(35)), /between 3 and 30/);
  assert.throws(() => validateSlug('-invalid-'), /cannot start or end with a hyphen/);
  assert.throws(() => validateSlug('has spaces'), /only contain lowercase/);
  assert.throws(() => validateSlug('admin'), /reserved/);
  assert.throws(() => validateSlug('superadmin'), /reserved/);
  assert.throws(() => validateSlug('api'), /reserved/);
});

test('generateTempPassword generates expected format', () => {
  const pwd = generateTempPassword();
  assert.ok(pwd.startsWith('Nivaas@'));
  assert.ok(pwd.length >= 14);
});
