/** Require test databases to use a clearly non-production database name. */
export function assertDedicatedIntegrationDatabase(connectionString) {
  if (!connectionString) throw new Error('Set TEST_DATABASE_URL to a dedicated PostgreSQL database before running integration tests.');

  let databaseName;
  try {
    databaseName = decodeURIComponent(new URL(connectionString).pathname.replace(/^\//, ''));
  } catch {
    throw new Error('TEST_DATABASE_URL must be a valid PostgreSQL connection URL.');
  }
  if (!databaseName) throw new Error('TEST_DATABASE_URL must include a database name.');
  if (!/(?:^|[_-])(?:test|testing|integration)(?:[_-]?\d+)?$/i.test(databaseName)) {
    throw new Error('Integration tests only run against a database whose name ends in _test, _testing, or _integration.');
  }
  return databaseName;
}
