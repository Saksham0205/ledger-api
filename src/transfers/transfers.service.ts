import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Account } from '../accounts/account.entity';
import {
  AccountNotFoundException,
  AppException,
  DuplicateTransactionException,
} from '../common/errors/app.exception';
import { PG_UNIQUE_VIOLATION, getPgErrorCode } from '../common/errors/db-errors';
import { applyBalanceChange } from '../transactions/balance.util';
import { TransactionResponseDto } from '../transactions/dto/transaction-response.dto';
import { Transaction } from '../transactions/transaction.entity';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { TransferResponseDto } from './dto/transfer-response.dto';

@Injectable()
export class TransfersService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Transaction) private readonly transactions: Repository<Transaction>,
  ) {}

  async create(dto: CreateTransferDto): Promise<TransferResponseDto> {
    if (dto.from_account_id === dto.to_account_id) {
      throw new AppException(
        400,
        'SAME_ACCOUNT_TRANSFER',
        'Source and destination accounts must be different',
      );
    }

    try {
      return await this.dataSource.transaction(async (manager) => {
        // Lock both rows in a deterministic (id) order so opposite transfers cannot deadlock.
        const locked = await manager
          .createQueryBuilder(Account, 'a')
          .setLock('pessimistic_write')
          .where('a.id IN (:...ids)', { ids: [dto.from_account_id, dto.to_account_id] })
          .orderBy('a.id', 'ASC')
          .getMany();
        for (const id of [dto.from_account_id, dto.to_account_id]) {
          if (!locked.some((account) => account.id === id)) throw new AccountNotFoundException(id);
        }

        const clashes = await manager.find(Transaction, {
          where: {
            accountId: In([dto.from_account_id, dto.to_account_id]),
            referenceId: dto.reference_id,
          },
        });
        if (clashes.length) {
          const source = clashes.find((tx) => tx.accountId === dto.from_account_id);
          throw new DuplicateTransactionException(
            source ? TransactionResponseDto.from(source) : undefined,
          );
        }

        const transferId = randomUUID();
        const description = dto.description ?? 'Transfer';

        // Any throw below rolls back both balance updates and both ledger rows.
        const fromBalance = await applyBalanceChange(
          manager,
          dto.from_account_id,
          'debit',
          dto.amount,
        );
        const toBalance = await applyBalanceChange(
          manager,
          dto.to_account_id,
          'credit',
          dto.amount,
        );

        const debit = await manager.save(
          manager.create(Transaction, {
            accountId: dto.from_account_id,
            type: 'debit',
            amount: dto.amount,
            description,
            referenceId: dto.reference_id,
            transferId,
          }),
        );
        const credit = await manager.save(
          manager.create(Transaction, {
            accountId: dto.to_account_id,
            type: 'credit',
            amount: dto.amount,
            description,
            referenceId: dto.reference_id,
            transferId,
          }),
        );

        return {
          transfer_id: transferId,
          amount: dto.amount,
          reference_id: dto.reference_id,
          from: {
            account_id: dto.from_account_id,
            balance: fromBalance,
            transaction: TransactionResponseDto.from(debit),
          },
          to: {
            account_id: dto.to_account_id,
            balance: toBalance,
            transaction: TransactionResponseDto.from(credit),
          },
        };
      });
    } catch (error) {
      if (getPgErrorCode(error) === PG_UNIQUE_VIOLATION) {
        const existing = await this.transactions.findOne({
          where: { accountId: dto.from_account_id, referenceId: dto.reference_id },
        });
        throw new DuplicateTransactionException(
          existing ? TransactionResponseDto.from(existing) : undefined,
        );
      }
      throw error;
    }
  }
}
