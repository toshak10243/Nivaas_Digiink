import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const configUrl = new URL('../../src/config.js', import.meta.url).href;
const validProductionEnv = {
  ...process.env,
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://nivaas:example@localhost:5432/nivaas',
  JWT_SECRET: 'a-unique-production-jwt-secret-with-more-than-32-characters',
  META_APP_SECRET: 'a-unique-meta-app-secret-with-more-than-32-characters',
  META_VERIFY_TOKEN: 'a-unique-meta-webhook-verification-token',
  WHATSAPP_WEBHOOK_ENABLED: 'true',
  PUBLIC_URL: 'https://nivaas.example.com',
};

function loadConfig(env) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(configUrl)})`], {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    env,
    encoding: 'utf8',
  });
}

test('production config loads with strong required secrets and HTTPS', () => {
  const result = loadConfig(validProductionEnv);
  assert.equal(result.status, 0, result.stderr);
});

test('production config refuses weak or missing required settings', () => {
  const cases = [
    [{ JWT_SECRET: 'short' }, /JWT_SECRET/],
    [{ PUBLIC_URL: 'http://nivaas.example.com' }, /HTTPS/],
    [{ DATABASE_URL: '' }, /DATABASE_URL/],
    [{ DATABASE_URL: 'mysql://user:pass@localhost/nivaas' }, /PostgreSQL/],
    [{ BASE_DOMAIN: 'not a domain/path' }, /BASE_DOMAIN/],
    [{ PORT: '70000' }, /PORT/],
    [{ MAX_UPLOAD_MB: 'invalid' }, /MAX_UPLOAD_MB/],
    [{ WHATSAPP_WEBHOOK_ENABLED: 'sometimes' }, /WHATSAPP_WEBHOOK_ENABLED/],
  ];
  for (const [override, error] of cases) {
    const result = loadConfig({ ...validProductionEnv, ...override });
    assert.notEqual(result.status, 0, `expected config to reject ${Object.keys(override).join(', ')}`);
    assert.match(result.stderr, error);
  }
});

test('production allows WhatsApp to remain disabled without Meta credentials', () => {
  const result = loadConfig({ ...validProductionEnv, WHATSAPP_WEBHOOK_ENABLED: 'false', META_APP_SECRET: '', META_VERIFY_TOKEN: '' });
  assert.equal(result.status, 0, result.stderr);
});

test('production requires strong Meta credentials only when WhatsApp webhooks are enabled', () => {
  for (const [override, error] of [
    [{ META_APP_SECRET: '' }, /META_APP_SECRET/],
    [{ META_VERIFY_TOKEN: 'nivaas-verify-123' }, /META_VERIFY_TOKEN/],
  ]) {
    const result = loadConfig({ ...validProductionEnv, ...override });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, error);
  }
});
