import { join } from 'path';
import { DataSourceOptions } from 'typeorm';

export function buildDataSourceOptions(url: string, ssl = false): DataSourceOptions {
  return {
    type: 'postgres',
    url,
    ssl: ssl ? { rejectUnauthorized: false } : false,
    entities: [join(__dirname, '..', '**', '*.entity{.ts,.js}')],
    migrations: [join(__dirname, '..', 'database', 'migrations', '*{.ts,.js}')],
    // Keep TypeORM's migration bookkeeping outside Supabase's exposed `public` schema.
    migrationsTableName: 'app_private.migrations',
    synchronize: false,
    migrationsRun: false,
    extra: { max: 20 },
  };
}

export function requireDatabaseUrl(env: NodeJS.ProcessEnv): string {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required. Copy .env.example to .env and adjust it.');
  }
  return env.DATABASE_URL;
}
