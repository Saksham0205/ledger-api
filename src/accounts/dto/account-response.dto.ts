import { ApiProperty } from '@nestjs/swagger';
import { Account } from '../account.entity';

export class AccountResponseDto {
  @ApiProperty({ example: '3f1c1d1e-8c1a-4b53-9d6e-0f2c8b2a1c11' }) id: string;
  @ApiProperty({ example: 'Alice Johnson' }) name: string;
  @ApiProperty({ example: 0 }) balance: number;
  @ApiProperty({ example: '2026-10-26T10:00:00.000Z' }) created_at: string;

  static from(account: Account): AccountResponseDto {
    return {
      id: account.id,
      name: account.name,
      balance: account.balance,
      created_at: account.createdAt.toISOString(),
    };
  }
}

export class BalanceResponseDto {
  @ApiProperty() account_id: string;
  @ApiProperty({ example: 100 }) balance: number;
}
