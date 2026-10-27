import 'dotenv/config';
import { requireDatabaseUrl } from '../config/database.config';
import { prepareMigrationsSchema } from './prepare-migrations-schema';

prepareMigrationsSchema(requireDatabaseUrl(process.env), process.env.DATABASE_SSL === 'true').catch((error: unknown) => {
  console.error('Failed to prepare the private TypeORM migrations schema.', error);
  process.exitCode = 1;
});
