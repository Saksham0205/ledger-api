import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Account } from '../accounts/account.entity';
import { AccountsService } from '../accounts/accounts.service';
import { buildPagination } from '../common/dto/pagination';
import {
  AccountNotFoundException,
  DuplicateTransactionException,
} from '../common/errors/app.exception';
import { PG_UNIQUE_VIOLATION, getPgErrorCode } from '../common/errors/db-errors';
import { applyBalanceChange } from './balance.util';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { ListTransactionsQuery } from './dto/list-transactions.query';
import {
  CreateTransactionResponseDto,
  TransactionListResponseDto,
  TransactionResponseDto,
} from './dto/transaction-response.dto';
import { Transaction } from './transaction.entity';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly accountsService: AccountsService,
    @InjectRepository(Transaction) private readonly transactions: Repository<Transaction>,
  ) {}

  async create(
    accountId: string,
    dto: CreateTransactionDto,
  ): Promise<CreateTransactionResponseDto> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        // Row lock serialises all writers for this account (no lost updates, no overdraw).
        const account = await manager
          .createQueryBuilder(Account, 'a')
          .setLock('pessimistic_write')
          .where('a.id = :id', { id: accountId })
          .getOne();
        if (!account) throw new AccountNotFoundException(accountId);

        const existing = await manager.findOne(Transaction, {
          where: { accountId, referenceId: dto.reference_id },
        });
        if (existing)
          throw new DuplicateTransactionException(TransactionResponseDto.from(existing));

        const balance = await applyBalanceChange(manager, accountId, dto.type, dto.amount);
        const saved = await manager.save(
          manager.create(Transaction, {
            accountId,
            type: dto.type,
            amount: dto.amount,
            description: dto.description,
            referenceId: dto.reference_id,
            transferId: null,
          }),
        );
        return { transaction: TransactionResponseDto.from(saved), balance };
      });
    } catch (error) {
      // Safety net: if the unique constraint fires despite the lock, still answer as a duplicate.
      if (getPgErrorCode(error) === PG_UNIQUE_VIOLATION) {
        const existing = await this.transactions.findOne({
          where: { accountId, referenceId: dto.reference_id },
        });
        throw new DuplicateTransactionException(
          existing ? TransactionResponseDto.from(existing) : undefined,
        );
      }
      throw error;
    }
  }

  async list(accountId: string, query: ListTransactionsQuery): Promise<TransactionListResponseDto> {
    await this.accountsService.findOneOrFail(accountId);

    const qb = this.transactions
      .createQueryBuilder('t')
      .where('t.accountId = :accountId', { accountId });
    if (query.type) qb.andWhere('t.type = :type', { type: query.type });

    const [rows, total] = await qb
      .orderBy('t.createdAt', 'DESC')
      .addOrderBy('t.id', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    return {
      data: rows.map((row) => TransactionResponseDto.from(row)),
      pagination: buildPagination(query.page, query.limit, total),
    };
  }
}
