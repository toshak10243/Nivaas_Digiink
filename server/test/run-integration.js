import { spawnSync } from 'node:child_process';

if (!process.env.TEST_DATABASE_URL) {
  console.error('Set TEST_DATABASE_URL to a dedicated PostgreSQL database before running integration tests.');
  process.exit(2);
}

const result = spawnSync(process.execPath, ['--test', 'test/integration.test.js'], { stdio: 'inherit', env: process.env });
process.exit(result.status ?? 1);
