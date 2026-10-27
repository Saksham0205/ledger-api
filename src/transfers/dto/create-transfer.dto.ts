import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
} from 'class-validator';
import { MAX_AMOUNT } from '../../transactions/dto/create-transaction.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateTransferDto {
  @ApiProperty()
  @IsUUID('all', { message: 'from_account_id must be a valid UUID' })
  from_account_id: string;

  @ApiProperty()
  @IsUUID('all', { message: 'to_account_id must be a valid UUID' })
  to_account_id: string;

  @ApiProperty({ example: 30 })
  @IsNumber(
    { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
    { message: 'amount must be a number with at most 2 decimal places' },
  )
  @IsPositive({ message: 'amount must be greater than 0' })
  @Max(MAX_AMOUNT, { message: `amount must not exceed ${MAX_AMOUNT}` })
  amount: number;

  @ApiProperty({ example: 'transfer-0001', maxLength: 100 })
  @Transform(trim)
  @IsString({ message: 'reference_id must be a string' })
  @IsNotEmpty({ message: 'reference_id is required' })
  @MaxLength(100)
  reference_id: string;

  @ApiPropertyOptional({ example: 'Rent share', maxLength: 255 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'description must not be blank' })
  @MaxLength(255)
  description?: string;
}
