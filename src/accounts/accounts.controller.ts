import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AccountIdPipe } from '../common/errors/uuid.pipe';
import { AccountsService } from './accounts.service';
import { AccountResponseDto, BalanceResponseDto } from './dto/account-response.dto';
import { CreateAccountDto } from './dto/create-account.dto';

@ApiTags('accounts')
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Create an account (balance always starts at 0)' })
  @ApiResponse({ status: 201, type: AccountResponseDto })
  @ApiResponse({ status: 400, description: 'VALIDATION_ERROR (e.g. missing name, extra fields)' })
  async create(@Body() dto: CreateAccountDto): Promise<AccountResponseDto> {
    return AccountResponseDto.from(await this.accountsService.create(dto));
  }

  @Get(':accountId/balance')
  @ApiOperation({ summary: 'Get the current balance of an account' })
  @ApiResponse({ status: 200, type: BalanceResponseDto })
  @ApiResponse({ status: 400, description: 'INVALID_ACCOUNT_ID' })
  @ApiResponse({ status: 404, description: 'ACCOUNT_NOT_FOUND' })
  async balance(@Param('accountId', AccountIdPipe) accountId: string): Promise<BalanceResponseDto> {
    const account = await this.accountsService.findOneOrFail(accountId);
    return { account_id: account.id, balance: account.balance };
  }
}
