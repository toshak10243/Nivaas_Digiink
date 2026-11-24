import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const sourceUrl = process.env.DATABASE_URL;
if (!sourceUrl) {
  console.error('Set DATABASE_URL in server/.env to a local PostgreSQL server before running local integration tests.');
  process.exit(2);
}

let parsedSource;
try { parsedSource = new URL(sourceUrl); } catch {
  console.error('DATABASE_URL must be a valid PostgreSQL connection URL.');
  process.exit(2);
}
const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
if (!localHosts.has(parsedSource.hostname)) {
  console.error('The temporary integration database runner only connects to local PostgreSQL hosts.');
  process.exit(2);
}

const databaseName = `nivaas_it_${process.pid}_${randomBytes(4).toString('hex')}_integration`;
const adminUrl = new URL(sourceUrl);
adminUrl.pathname = '/postgres';
adminUrl.searchParams.delete('options');
const temporaryUrl = new URL(sourceUrl);
temporaryUrl.pathname = `/${databaseName}`;
let created = false;
let exitCode = 1;
const admin = new Client({ connectionString: adminUrl.toString() });

try {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  created = true;
  const result = spawnSync(process.execPath, ['--test', 'test/integration.test.js'], {
    stdio: 'inherit',
    env: { ...process.env, TEST_DATABASE_URL: temporaryUrl.toString() },
  });
  exitCode = result.status ?? 1;
  if (result.error) throw result.error;
} catch (error) {
  console.error(`Local integration test setup failed: ${error.message}`);
  exitCode = 1;
} finally {
  if (created) {
    try {
      await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()', [databaseName]);
      await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    } catch (error) {
      console.error(`Could not remove temporary integration database ${databaseName}: ${error.message}`);
      exitCode = 1;
    }
  }
  await admin.end().catch(() => {});
}

process.exit(exitCode);
