import { HttpException, HttpStatus } from '@nestjs/common';

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_ACCOUNT_ID'
  | 'ACCOUNT_NOT_FOUND'
  | 'INVALID_TRANSACTION_TYPE'
  | 'INVALID_AMOUNT'
  | 'INSUFFICIENT_BALANCE'
  | 'DUPLICATE_TRANSACTION'
  | 'INVALID_PAGINATION'
  | 'INVALID_REQUEST_BODY'
  | 'SAME_ACCOUNT_TRANSFER'
  | 'NOT_FOUND'
  | 'INTERNAL_ERROR';

export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message, status);
  }
}

export class AccountNotFoundException extends AppException {
  constructor(accountId: string) {
    super(HttpStatus.NOT_FOUND, 'ACCOUNT_NOT_FOUND', `Account ${accountId} not found`);
  }
}

export class InsufficientBalanceException extends AppException {
  constructor() {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'INSUFFICIENT_BALANCE',
      'Account does not have sufficient balance for this debit',
    );
  }
}

export class DuplicateTransactionException extends AppException {
  constructor(existing?: unknown) {
    super(
      HttpStatus.CONFLICT,
      'DUPLICATE_TRANSACTION',
      'Transaction with this reference_id already exists for this account',
      existing ? { transaction: existing } : undefined,
    );
  }
}

export class InvalidAccountIdException extends AppException {
  constructor() {
    super(HttpStatus.BAD_REQUEST, 'INVALID_ACCOUNT_ID', 'Account ID must be a valid UUID');
  }
}
