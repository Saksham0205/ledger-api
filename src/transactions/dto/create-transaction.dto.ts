import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsNumber, IsPositive, IsString, Max, MaxLength } from 'class-validator';
import { TRANSACTION_TYPES, TransactionType } from '../transaction.entity';

export const MAX_AMOUNT = 1_000_000_000;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateTransactionDto {
  @ApiProperty({ enum: TRANSACTION_TYPES, example: 'credit' })
  @IsIn(TRANSACTION_TYPES, { message: 'type must be either credit or debit' })
  type: TransactionType;

  @ApiProperty({ example: 50.25, description: 'Greater than 0, max 2 decimal places' })
  @IsNumber(
    { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
    { message: 'amount must be a number with at most 2 decimal places' },
  )
  @IsPositive({ message: 'amount must be greater than 0' })
  @Max(MAX_AMOUNT, { message: `amount must not exceed ${MAX_AMOUNT}` })
  amount: number;

  @ApiProperty({ example: 'Salary for October', maxLength: 255 })
  @Transform(trim)
  @IsString({ message: 'description must be a string' })
  @IsNotEmpty({ message: 'description is required' })
  @MaxLength(255)
  description: string;

  @ApiProperty({
    example: 'ref-0001',
    maxLength: 100,
    description: 'Unique per account; makes the request idempotent',
  })
  @Transform(trim)
  @IsString({ message: 'reference_id must be a string' })
  @IsNotEmpty({ message: 'reference_id is required' })
  @MaxLength(100)
  reference_id: string;
}
