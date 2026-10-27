import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { numericTransformer } from '../common/numeric.transformer';

export type TransactionType = 'credit' | 'debit';
export const TRANSACTION_TYPES: TransactionType[] = ['credit', 'debit'];

@Entity('transactions')
@Index('transactions_account_reference_unique', ['accountId', 'referenceId'], { unique: true })
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @Column({ type: 'varchar', length: 10 })
  type: TransactionType;

  @Column({ type: 'numeric', precision: 18, scale: 2, transformer: numericTransformer })
  amount: number;

  @Column({ type: 'varchar', length: 255 })
  description: string;

  @Column({ name: 'reference_id', type: 'varchar', length: 100 })
  referenceId: string;

  @Column({ name: 'transfer_id', type: 'uuid', nullable: true })
  transferId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
