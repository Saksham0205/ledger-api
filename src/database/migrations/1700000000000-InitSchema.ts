import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1700000000000 implements MigrationInterface {
  name = 'InitSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await queryRunner.query(`
      CREATE TABLE accounts (
        id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        name        VARCHAR(255)  NOT NULL,
        balance     NUMERIC(18,2) NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT accounts_name_not_blank CHECK (length(trim(name)) > 0),
        CONSTRAINT accounts_balance_non_negative CHECK (balance >= 0)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE transactions (
        id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        account_id    UUID          NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
        type          VARCHAR(10)   NOT NULL,
        amount        NUMERIC(18,2) NOT NULL,
        description   VARCHAR(255)  NOT NULL,
        reference_id  VARCHAR(100)  NOT NULL,
        transfer_id   UUID          NULL,
        created_at    TIMESTAMPTZ   NOT NULL DEFAULT clock_timestamp(),
        CONSTRAINT transactions_type_valid CHECK (type IN ('credit', 'debit')),
        CONSTRAINT transactions_amount_positive CHECK (amount > 0),
        CONSTRAINT transactions_reference_not_blank CHECK (length(trim(reference_id)) > 0),
        CONSTRAINT transactions_account_reference_unique UNIQUE (account_id, reference_id)
      )
    `);

    await queryRunner.query(
      `CREATE INDEX idx_transactions_account_created ON transactions (account_id, created_at DESC, id DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_transactions_account_type_created ON transactions (account_id, type, created_at DESC, id DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_transactions_transfer ON transactions (transfer_id) WHERE transfer_id IS NOT NULL`,
    );

    // Ledger rows are append-only: block UPDATE and DELETE at the database level.
    await queryRunner.query(`
      CREATE FUNCTION prevent_transaction_mutation() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'transactions are immutable: % is not allowed', TG_OP
          USING ERRCODE = 'integrity_constraint_violation';
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER transactions_immutable
      BEFORE UPDATE OR DELETE ON transactions
      FOR EACH ROW EXECUTE FUNCTION prevent_transaction_mutation()
    `);

    // The Supabase Data API must not expose ledger rows without an authorization policy.
    // The trusted API database role owns these tables and continues to use them directly.
    await queryRunner.query(`ALTER TABLE accounts ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE transactions ENABLE ROW LEVEL SECURITY`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS transactions_immutable ON transactions`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS prevent_transaction_mutation`);
    await queryRunner.query(`DROP TABLE IF EXISTS transactions`);
    await queryRunner.query(`DROP TABLE IF EXISTS accounts`);
  }
}
