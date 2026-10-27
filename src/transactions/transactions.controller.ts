import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AccountIdPipe } from '../common/errors/uuid.pipe';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { ListTransactionsQuery } from './dto/list-transactions.query';
import {
  CreateTransactionResponseDto,
  TransactionListResponseDto,
} from './dto/transaction-response.dto';
import { TransactionsService } from './transactions.service';

// Intentionally no PUT / PATCH / DELETE: transactions are immutable.
@ApiTags('transactions')
@Controller('accounts/:accountId/transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Add a credit or debit transaction (idempotent per reference_id)' })
  @ApiResponse({ status: 201, type: CreateTransactionResponseDto })
  @ApiResponse({
    status: 400,
    description:
      'VALIDATION_ERROR / INVALID_AMOUNT / INVALID_TRANSACTION_TYPE / INVALID_ACCOUNT_ID',
  })
  @ApiResponse({ status: 404, description: 'ACCOUNT_NOT_FOUND' })
  @ApiResponse({
    status: 409,
    description: 'DUPLICATE_TRANSACTION (existing transaction in details)',
  })
  @ApiResponse({ status: 422, description: 'INSUFFICIENT_BALANCE' })
  create(
    @Param('accountId', AccountIdPipe) accountId: string,
    @Body() dto: CreateTransactionDto,
  ): Promise<CreateTransactionResponseDto> {
    return this.transactionsService.create(accountId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List transactions (filter by type, paginated, latest first)' })
  @ApiResponse({ status: 200, type: TransactionListResponseDto })
  @ApiResponse({
    status: 400,
    description: 'INVALID_PAGINATION / INVALID_TRANSACTION_TYPE / INVALID_ACCOUNT_ID',
  })
  @ApiResponse({ status: 404, description: 'ACCOUNT_NOT_FOUND' })
  list(
    @Param('accountId', AccountIdPipe) accountId: string,
    @Query() query: ListTransactionsQuery,
  ): Promise<TransactionListResponseDto> {
    return this.transactionsService.list(accountId, query);
  }
}
