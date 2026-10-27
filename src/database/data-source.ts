import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions, requireDatabaseUrl } from '../config/database.config';

// Used by the TypeORM CLI (migration:run / migration:revert).
export default new DataSource(
  buildDataSourceOptions(requireDatabaseUrl(process.env), process.env.DATABASE_SSL === 'true'),
);
