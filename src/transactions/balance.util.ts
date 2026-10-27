import { EntityManager } from 'typeorm';
import { InsufficientBalanceException } from '../common/errors/app.exception';
import { TransactionType } from './transaction.entity';

/**
 * Applies a credit/debit to an account balance inside the caller's DB transaction and
 * returns the new balance. The math runs in Postgres NUMERIC (no float drift), and the
 * debit guard is part of the UPDATE itself, so an overdraw is impossible even if the
 * caller forgot to lock the row. Callers should still lock the account row first.
 */
export async function applyBalanceChange(
  manager: EntityManager,
  accountId: string,
  type: TransactionType,
  amount: number,
): Promise<number> {
  const sql =
    type === 'credit'
      ? 'UPDATE accounts SET balance = balance + $1 WHERE id = $2 RETURNING balance'
      : 'UPDATE accounts SET balance = balance - $1 WHERE id = $2 AND balance >= $1 RETURNING balance';

  const result: unknown = await manager.query(sql, [amount, accountId]);
  // Depending on driver version the rows are returned directly or as [rows, affectedCount].
  const rows = (Array.isArray((result as unknown[])[0]) ? (result as unknown[])[0] : result) as {
    balance: string;
  }[];

  if (!rows.length) {
    if (type === 'debit') throw new InsufficientBalanceException();
    throw new Error(`Balance update affected no rows for account ${accountId}`);
  }
  return Number(rows[0].balance);
}
