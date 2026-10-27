import { QueryFailedError } from 'typeorm';
import { AllExceptionsFilter } from './all-exceptions.filter';
import {
  AccountNotFoundException,
  DuplicateTransactionException,
  InsufficientBalanceException,
} from '../errors/app.exception';

describe('AllExceptionsFilter.normalize', () => {
  const filter = new AllExceptionsFilter();

  it('maps domain exceptions to their status and code', () => {
    expect(filter.normalize(new AccountNotFoundException('x'))).toMatchObject({
      status: 404,
      code: 'ACCOUNT_NOT_FOUND',
    });
    expect(filter.normalize(new InsufficientBalanceException())).toMatchObject({
      status: 422,
      code: 'INSUFFICIENT_BALANCE',
    });
    expect(filter.normalize(new DuplicateTransactionException({ id: '1' }))).toMatchObject({
      status: 409,
      code: 'DUPLICATE_TRANSACTION',
      details: { transaction: { id: '1' } },
    });
  });

  it('maps postgres unique violations to 409', () => {
    const error = new QueryFailedError(
      'INSERT',
      [],
      Object.assign(new Error('dup'), { code: '23505' }),
    );
    expect(filter.normalize(error)).toMatchObject({ status: 409, code: 'DUPLICATE_TRANSACTION' });
  });

  it('maps malformed JSON to INVALID_REQUEST_BODY', () => {
    const error = Object.assign(new SyntaxError('bad'), { type: 'entity.parse.failed' });
    expect(filter.normalize(error)).toMatchObject({ status: 400, code: 'INVALID_REQUEST_BODY' });
  });

  it('hides unexpected errors behind a 500', () => {
    expect(filter.normalize(new Error('secret sql'))).toEqual({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  });
});
