import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountNotFoundException } from '../common/errors/app.exception';
import { Account } from './account.entity';
import { CreateAccountDto } from './dto/create-account.dto';

@Injectable()
export class AccountsService {
  constructor(@InjectRepository(Account) private readonly accounts: Repository<Account>) {}

  /** Balance and id are never taken from the client: DB defaults apply. */
  async create(dto: CreateAccountDto): Promise<Account> {
    const account = this.accounts.create({ name: dto.name });
    return this.accounts.save(account);
  }

  async findOneOrFail(id: string): Promise<Account> {
    const account = await this.accounts.findOne({ where: { id } });
    if (!account) throw new AccountNotFoundException(id);
    return account;
  }
}
