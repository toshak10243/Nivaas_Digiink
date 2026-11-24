import { spawnSync } from 'node:child_process';
import { assertDedicatedIntegrationDatabase } from './lib/integration-db.js';

try {
  assertDedicatedIntegrationDatabase(process.env.TEST_DATABASE_URL);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

const result = spawnSync(process.execPath, ['--test', 'test/integration.test.js'], { stdio: 'inherit', env: process.env });
process.exit(result.status ?? 1);
