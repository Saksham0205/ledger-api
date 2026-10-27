import 'dotenv/config';

// E2E tests always run against the dedicated test database, never the dev one.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/ledger_test';
process.env.DATABASE_SSL = 'false';
