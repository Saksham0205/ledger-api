import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { TransferResponseDto } from './dto/transfer-response.dto';
import { TransfersService } from './transfers.service';

@ApiTags('transfers')
@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Atomically move money between two accounts (bonus)' })
  @ApiResponse({ status: 201, type: TransferResponseDto })
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_ERROR / INVALID_AMOUNT / SAME_ACCOUNT_TRANSFER',
  })
  @ApiResponse({ status: 404, description: 'ACCOUNT_NOT_FOUND' })
  @ApiResponse({ status: 409, description: 'DUPLICATE_TRANSACTION' })
  @ApiResponse({ status: 422, description: 'INSUFFICIENT_BALANCE' })
  create(@Body() dto: CreateTransferDto): Promise<TransferResponseDto> {
    return this.transfersService.create(dto);
  }
}
