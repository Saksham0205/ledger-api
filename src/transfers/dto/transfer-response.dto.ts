import { ApiProperty } from '@nestjs/swagger';
import { TransactionResponseDto } from '../../transactions/dto/transaction-response.dto';

export class TransferLegDto {
  @ApiProperty() account_id: string;
  @ApiProperty({ example: 70, description: 'Balance after the transfer' }) balance: number;
  @ApiProperty({ type: TransactionResponseDto }) transaction: TransactionResponseDto;
}

export class TransferResponseDto {
  @ApiProperty() transfer_id: string;
  @ApiProperty() amount: number;
  @ApiProperty() reference_id: string;
  @ApiProperty({ type: TransferLegDto }) from: TransferLegDto;
  @ApiProperty({ type: TransferLegDto }) to: TransferLegDto;
}
