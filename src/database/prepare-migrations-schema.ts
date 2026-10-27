import { Client } from 'pg';

export async function prepareMigrationsSchema(url: string, ssl = false): Promise<void> {
  const client = new Client({
    connectionString: url,
    ssl: ssl ? { rejectUnauthorized: false } : undefined,
  });

  try {
    await client.connect();
    await client.query('CREATE SCHEMA IF NOT EXISTS app_private');
    await client.query('REVOKE ALL ON SCHEMA app_private FROM PUBLIC');
    await client.query(`
      DO $$
      DECLARE role_name text;
      BEGIN
        FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
            EXECUTE format('REVOKE ALL ON SCHEMA app_private FROM %I', role_name);
          END IF;
        END LOOP;
      END;
      $$
    `);
  } finally {
    await client.end();
  }
}
