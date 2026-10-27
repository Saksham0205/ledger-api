import { ApiProperty } from '@nestjs/swagger';
import { PaginationMeta } from '../../common/dto/pagination';
import { Transaction, TransactionType } from '../transaction.entity';

export class TransactionResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() account_id: string;
  @ApiProperty({ enum: ['credit', 'debit'] }) type: TransactionType;
  @ApiProperty({ example: 50 }) amount: number;
  @ApiProperty() description: string;
  @ApiProperty() reference_id: string;
  @ApiProperty({ nullable: true, description: 'Set when the row is one leg of a transfer' })
  transfer_id: string | null;
  @ApiProperty() created_at: string;

  static from(tx: Transaction): TransactionResponseDto {
    return {
      id: tx.id,
      account_id: tx.accountId,
      type: tx.type,
      amount: tx.amount,
      description: tx.description,
      reference_id: tx.referenceId,
      transfer_id: tx.transferId,
      created_at: tx.createdAt.toISOString(),
    };
  }
}

export class CreateTransactionResponseDto {
  @ApiProperty({ type: TransactionResponseDto }) transaction: TransactionResponseDto;
  @ApiProperty({ example: 150, description: 'Account balance after the transaction' })
  balance: number;
}

export class TransactionListResponseDto {
  @ApiProperty({ type: [TransactionResponseDto] }) data: TransactionResponseDto[];
  @ApiProperty({ type: PaginationMeta }) pagination: PaginationMeta;
}
