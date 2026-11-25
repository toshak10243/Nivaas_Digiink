import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
const failures = [];

if (!fs.existsSync(envPath)) {
  console.error('Deployment preflight failed: root .env file is missing. Copy server/.env.example to .env and configure it first.');
  process.exit(1);
}

let env;
try {
  env = {};
  const contents = fs.readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '');
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const entry = trimmed.startsWith('export ') ? trimmed.slice(7) : trimmed;
    const separator = entry.indexOf('=');
    if (separator < 1) continue;
    const key = entry.slice(0, separator).trim();
    let value = entry.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    env[key] = value;
  }
} catch (error) {
  console.error(`Deployment preflight failed: cannot read .env (${error.message}).`);
  process.exit(1);
}

const add = (condition, message) => { if (!condition) failures.push(message); };
const jwtSecret = env.JWT_SECRET || '';
const dbPassword = env.DB_PASSWORD || '';
const publicUrl = env.PUBLIC_URL || '';
const baseDomain = env.BASE_DOMAIN || '';

add(dbPassword.length >= 32, 'Set DB_PASSWORD to a unique value of at least 32 characters.');
add(jwtSecret.length >= 32 && !['change-me-to-a-long-random-string', 'dev-secret-change-me'].includes(jwtSecret), 'Set JWT_SECRET to a unique random value of at least 32 characters.');

let parsedPublicUrl;
try { parsedPublicUrl = new URL(publicUrl); } catch {}
add(parsedPublicUrl?.protocol === 'https:' && Boolean(parsedPublicUrl.hostname), 'PUBLIC_URL must be a valid HTTPS URL.');
add(/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(baseDomain), 'BASE_DOMAIN must be a valid public hostname.');

const webhookEnabled = (env.WHATSAPP_WEBHOOK_ENABLED || 'false').toLowerCase();
add(['true', 'false'].includes(webhookEnabled), 'WHATSAPP_WEBHOOK_ENABLED must be true or false.');
if (webhookEnabled === 'true') {
  add((env.META_APP_SECRET || '').length >= 32, 'Set META_APP_SECRET to a unique value of at least 32 characters when WhatsApp webhooks are enabled.');
  const verifyToken = env.META_VERIFY_TOKEN || '';
  add(verifyToken.length >= 24 && !['nivaas-verify', 'nivaas-verify-123'].includes(verifyToken), 'Set META_VERIFY_TOKEN to a unique value of at least 24 characters when WhatsApp webhooks are enabled.');
}

if (failures.length) {
  console.error('Deployment preflight failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const compose = spawnSync('docker', ['compose', 'config', '--quiet'], { cwd: root, stdio: 'inherit' });
if (compose.error || compose.status !== 0) {
  console.error('Deployment preflight failed: Docker Compose configuration is invalid or Docker Compose is unavailable.');
  process.exit(compose.status || 1);
}

console.log('Deployment preflight passed. Production environment and Docker Compose configuration look valid.');
