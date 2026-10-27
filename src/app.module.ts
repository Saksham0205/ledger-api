import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountsModule } from './accounts/accounts.module';
import { buildDataSourceOptions } from './config/database.config';
import { prepareMigrationsSchema } from './database/prepare-migrations-schema';
import { HealthController } from './health/health.controller';
import { TransactionsModule } from './transactions/transactions.module';
import { TransfersModule } from './transfers/transfers.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const url = config.get<string>('DATABASE_URL');
        if (!url) throw new Error('DATABASE_URL is required. Copy .env.example to .env.');
        const ssl = config.get<string>('DATABASE_SSL') === 'true';
        await prepareMigrationsSchema(url, ssl);
        return buildDataSourceOptions(url, ssl);
      },
    }),
    AccountsModule,
    TransactionsModule,
    TransfersModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
