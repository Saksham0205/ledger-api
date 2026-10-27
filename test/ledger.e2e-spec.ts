import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

const API = '/api/v1';

describe('Transaction Ledger API (e2e)', () => {
  let app: INestApplication;
  let db: DataSource;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    app.getHttpServer().setMaxListeners(0);
    await app.init();
    db = app.get(DataSource);
    await db.runMigrations();
  });

  beforeEach(async () => {
    await db.query('TRUNCATE transactions, accounts RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await app.close();
  });

  // ---------- helpers ----------
  async function createAccount(name = 'Alice'): Promise<string> {
    const res = await http().post(`${API}/accounts`).send({ name }).expect(201);
    return res.body.id as string;
  }

  let refCounter = 0;
  const tx = (id: string, type: string, amount: unknown, extra: Record<string, unknown> = {}) =>
    http()
      .post(`${API}/accounts/${id}/transactions`)
      .send({
        type,
        amount,
        description: `${type} test`,
        reference_id: `ref-${++refCounter}`,
        ...extra,
      });

  async function balanceOf(id: string): Promise<number> {
    const res = await http().get(`${API}/accounts/${id}/balance`).expect(200);
    return res.body.balance as number;
  }

  async function ledgerSum(id: string): Promise<number> {
    const rows = await db.query(
      `SELECT COALESCE(SUM(CASE WHEN type='credit' THEN amount ELSE -amount END), 0)::float AS s
       FROM transactions WHERE account_id = $1`,
      [id],
    );
    return rows[0].s as number;
  }

  // ---------- health ----------
  it('GET /health pings the database', async () => {
    const res = await http().get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', database: 'up' });
  });

  // ---------- 1. create account ----------
  describe('POST /accounts', () => {
    it('creates an account with balance 0 and system generated id and created_at', async () => {
      const res = await http().post(`${API}/accounts`).send({ name: '  Alice  ' }).expect(201);
      expect(res.body).toEqual({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        name: 'Alice',
        balance: 0,
        created_at: expect.any(String),
      });
      expect(Number.isNaN(Date.parse(res.body.created_at))).toBe(false);
    });

    it('generates unique ids', async () => {
      const [a, b] = [await createAccount('A'), await createAccount('B')];
      expect(a).not.toEqual(b);
    });

    it.each([[{}], [{ name: '' }], [{ name: '   ' }], [{ name: 123 }]])(
      'rejects invalid name %j',
      async (body) => {
        const res = await http().post(`${API}/accounts`).send(body).expect(400);
        expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR', statusCode: 400 });
        expect(res.body.details[0]).toHaveProperty('field', 'name');
      },
    );

    it('does not let the client set balance, id or created_at', async () => {
      for (const extra of [{ balance: 500 }, { id: randomUUID() }, { created_at: '2020-01-01' }]) {
        const res = await http()
          .post(`${API}/accounts`)
          .send({ name: 'Eve', ...extra })
          .expect(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
      }
      const count = await db.query('SELECT count(*)::int AS c FROM accounts');
      expect(count[0].c).toBe(0);
    });

    it('returns a clean 400 for malformed JSON', async () => {
      const res = await http()
        .post(`${API}/accounts`)
        .set('Content-Type', 'application/json')
        .send('{"name": ')
        .expect(400);
      expect(res.body).toMatchObject({ code: 'INVALID_REQUEST_BODY', statusCode: 400 });
    });
  });

  // ---------- 3. balance ----------
  describe('GET /accounts/:id/balance', () => {
    it('returns account_id and balance', async () => {
      const id = await createAccount();
      const res = await http().get(`${API}/accounts/${id}/balance`).expect(200);
      expect(res.body).toEqual({ account_id: id, balance: 0 });
    });

    it('400 for an invalid id, 404 for an unknown id', async () => {
      const bad = await http().get(`${API}/accounts/not-a-uuid/balance`).expect(400);
      expect(bad.body.code).toBe('INVALID_ACCOUNT_ID');
      const missing = await http().get(`${API}/accounts/${randomUUID()}/balance`).expect(404);
      expect(missing.body.code).toBe('ACCOUNT_NOT_FOUND');
    });
  });

  // ---------- 2. transactions ----------
  describe('POST /accounts/:id/transactions', () => {
    it('credit increases the balance (100 + 50 = 150)', async () => {
      const id = await createAccount();
      await tx(id, 'credit', 100).expect(201);
      const res = await tx(id, 'credit', 50).expect(201);
      expect(res.body.balance).toBe(150);
      expect(res.body.transaction).toMatchObject({
        account_id: id,
        type: 'credit',
        amount: 50,
        description: 'credit test',
        reference_id: expect.any(String),
        created_at: expect.any(String),
      });
      expect(await balanceOf(id)).toBe(150);
    });

    it('debit decreases the balance (100 - 30 = 70)', async () => {
      const id = await createAccount();
      await tx(id, 'credit', 100).expect(201);
      const res = await tx(id, 'debit', 30).expect(201);
      expect(res.body.balance).toBe(70);
      expect(await balanceOf(id)).toBe(70);
    });

    it('rejects a debit above the balance (100 - 150) and keeps the balance', async () => {
      const id = await createAccount();
      await tx(id, 'credit', 100).expect(201);
      const res = await tx(id, 'debit', 150).expect(422);
      expect(res.body.code).toBe('INSUFFICIENT_BALANCE');
      expect(await balanceOf(id)).toBe(100);
      const rows = await db.query('SELECT count(*)::int AS c FROM transactions');
      expect(rows[0].c).toBe(1);
    });

    it('allows debiting the exact balance', async () => {
      const id = await createAccount();
      await tx(id, 'credit', 100.5).expect(201);
      await tx(id, 'debit', 100.5).expect(201);
      expect(await balanceOf(id)).toBe(0);
    });

    it('keeps decimal math exact (0.1 + 0.2)', async () => {
      const id = await createAccount();
      await tx(id, 'credit', 0.1).expect(201);
      const res = await tx(id, 'credit', 0.2).expect(201);
      expect(res.body.balance).toBe(0.3);
    });

    it('follows the spec sequence 0 +100 +50 -30 -20 = 100 and matches the ledger sum', async () => {
      const id = await createAccount();
      await tx(id, 'credit', 100).expect(201);
      await tx(id, 'credit', 50).expect(201);
      await tx(id, 'debit', 30).expect(201);
      await tx(id, 'debit', 20).expect(201);
      expect(await balanceOf(id)).toBe(100);
      expect(await ledgerSum(id)).toBe(100);
    });

    it('validates type, amount, description and reference_id', async () => {
      const id = await createAccount();
      const cases: [Record<string, unknown>, string, string][] = [
        [{ type: 'transfer' }, 'INVALID_TRANSACTION_TYPE', 'type'],
        [{ type: undefined }, 'INVALID_TRANSACTION_TYPE', 'type'],
        [{ amount: 0 }, 'INVALID_AMOUNT', 'amount'],
        [{ amount: -5 }, 'INVALID_AMOUNT', 'amount'],
        [{ amount: 1.005 }, 'INVALID_AMOUNT', 'amount'],
        [{ amount: '10' }, 'INVALID_AMOUNT', 'amount'],
        [{ amount: undefined }, 'INVALID_AMOUNT', 'amount'],
        [{ amount: 1e12 }, 'INVALID_AMOUNT', 'amount'],
        [{ reference_id: undefined }, 'VALIDATION_ERROR', 'reference_id'],
        [{ reference_id: '   ' }, 'VALIDATION_ERROR', 'reference_id'],
        [{ description: undefined }, 'VALIDATION_ERROR', 'description'],
      ];
      for (const [override, code, field] of cases) {
        const body = {
          type: 'credit',
          amount: 10,
          description: 'd',
          reference_id: 'r',
          ...override,
        };
        const res = await http().post(`${API}/accounts/${id}/transactions`).send(body).expect(400);
        expect(res.body.code).toBe(code);
        expect(res.body.details.map((d: { field: string }) => d.field)).toContain(field);
      }
      expect(await balanceOf(id)).toBe(0);
    });

    it('rejects unknown body fields', async () => {
      const id = await createAccount();
      await tx(id, 'credit', 10, { created_at: '2020-01-01' }).expect(400);
    });

    it('400 for an invalid account id, 404 for an unknown one', async () => {
      const bad = await tx('nope', 'credit', 10).expect(400);
      expect(bad.body.code).toBe('INVALID_ACCOUNT_ID');
      const missing = await tx(randomUUID(), 'credit', 10).expect(404);
      expect(missing.body.code).toBe('ACCOUNT_NOT_FOUND');
    });

    it('treats a repeated reference_id on the same account as a duplicate (409)', async () => {
      const id = await createAccount();
      const first = await tx(id, 'credit', 100, { reference_id: 'dup-1' }).expect(201);
      const second = await tx(id, 'credit', 100, { reference_id: 'dup-1' }).expect(409);
      expect(second.body.code).toBe('DUPLICATE_TRANSACTION');
      expect(second.body.details.transaction.id).toBe(first.body.transaction.id);
      expect(await balanceOf(id)).toBe(100);
      const rows = await db.query('SELECT count(*)::int AS c FROM transactions');
      expect(rows[0].c).toBe(1);
    });

    it('allows the same reference_id on different accounts', async () => {
      const a = await createAccount('A');
      const b = await createAccount('B');
      await tx(a, 'credit', 10, { reference_id: 'shared' }).expect(201);
      await tx(b, 'credit', 10, { reference_id: 'shared' }).expect(201);
    });

    it('is atomic: a failure after the balance update rolls everything back', async () => {
      const id = await createAccount();
      await tx(id, 'credit', 100).expect(201);
      await db.query(
        `ALTER TABLE transactions ADD CONSTRAINT tmp_force_fail CHECK (description <> 'FORCE_FAIL') NOT VALID`,
      );
      try {
        const res = await tx(id, 'credit', 50, { description: 'FORCE_FAIL' });
        expect(res.status).toBeGreaterThanOrEqual(400);
      } finally {
        await db.query('ALTER TABLE transactions DROP CONSTRAINT tmp_force_fail');
      }
      expect(await balanceOf(id)).toBe(100);
      expect(await ledgerSum(id)).toBe(100);
    });
  });

  // ---------- 4. history ----------
  describe('GET /accounts/:id/transactions', () => {
    async function seed(id: string) {
      await tx(id, 'credit', 100, { reference_id: 'c1' }).expect(201);
      await tx(id, 'credit', 50, { reference_id: 'c2' }).expect(201);
      await tx(id, 'debit', 30, { reference_id: 'd1' }).expect(201);
      await tx(id, 'debit', 20, { reference_id: 'd2' }).expect(201);
      await tx(id, 'credit', 5, { reference_id: 'c3' }).expect(201);
    }
    const refs = (body: { data: { reference_id: string }[] }) =>
      body.data.map((t) => t.reference_id);

    it('returns latest first, both types by default, with pagination metadata', async () => {
      const id = await createAccount();
      await seed(id);
      const res = await http().get(`${API}/accounts/${id}/transactions`).expect(200);
      expect(refs(res.body)).toEqual(['c3', 'd2', 'd1', 'c2', 'c1']);
      expect(res.body.pagination).toEqual({ page: 1, limit: 10, total_records: 5, total_pages: 1 });
    });

    it('filters by type', async () => {
      const id = await createAccount();
      await seed(id);
      const credits = await http()
        .get(`${API}/accounts/${id}/transactions?type=credit`)
        .expect(200);
      expect(refs(credits.body)).toEqual(['c3', 'c2', 'c1']);
      expect(credits.body.pagination.total_records).toBe(3);
      const debits = await http().get(`${API}/accounts/${id}/transactions?type=debit`).expect(200);
      expect(refs(debits.body)).toEqual(['d2', 'd1']);
    });

    it('paginates with page and limit', async () => {
      const id = await createAccount();
      await seed(id);
      const p1 = await http().get(`${API}/accounts/${id}/transactions?page=1&limit=2`).expect(200);
      expect(refs(p1.body)).toEqual(['c3', 'd2']);
      expect(p1.body.pagination).toEqual({ page: 1, limit: 2, total_records: 5, total_pages: 3 });
      const p3 = await http().get(`${API}/accounts/${id}/transactions?page=3&limit=2`).expect(200);
      expect(refs(p3.body)).toEqual(['c1']);
      const p9 = await http().get(`${API}/accounts/${id}/transactions?page=9&limit=2`).expect(200);
      expect(p9.body.data).toEqual([]);
    });

    it('returns an empty list for an account without transactions', async () => {
      const id = await createAccount();
      const res = await http().get(`${API}/accounts/${id}/transactions`).expect(200);
      expect(res.body).toEqual({
        data: [],
        pagination: { page: 1, limit: 10, total_records: 0, total_pages: 0 },
      });
    });

    it.each(['page=0', 'page=-1', 'page=abc', 'page=1.5', 'limit=0', 'limit=101', 'limit=x'])(
      'rejects invalid pagination (%s)',
      async (qs) => {
        const id = await createAccount();
        const res = await http().get(`${API}/accounts/${id}/transactions?${qs}`).expect(400);
        expect(res.body.code).toBe('INVALID_PAGINATION');
      },
    );

    it('rejects an invalid type filter, an invalid id and an unknown account', async () => {
      const id = await createAccount();
      const type = await http().get(`${API}/accounts/${id}/transactions?type=refund`).expect(400);
      expect(type.body.code).toBe('INVALID_TRANSACTION_TYPE');
      await http().get(`${API}/accounts/bad/transactions`).expect(400);
      await http().get(`${API}/accounts/${randomUUID()}/transactions`).expect(404);
    });
  });

  // ---------- 5. integrity ----------
  describe('data integrity', () => {
    it('exposes no way to edit or delete transactions through the API', async () => {
      const id = await createAccount();
      const created = await tx(id, 'credit', 10).expect(201);
      const url = `${API}/accounts/${id}/transactions/${created.body.transaction.id}`;
      for (const method of ['put', 'patch', 'delete'] as const) {
        const res = await http()[method](url).send({ amount: 999 });
        expect(res.status).toBe(404);
      }
      await http().delete(`${API}/accounts/${id}/transactions`).expect(404);
    });

    it('is enforced by the database: raw UPDATE and DELETE fail', async () => {
      const id = await createAccount();
      await tx(id, 'credit', 10).expect(201);
      await expect(db.query('UPDATE transactions SET amount = 999')).rejects.toThrow(/immutable/);
      await expect(db.query('DELETE FROM transactions')).rejects.toThrow(/immutable/);
      expect(await ledgerSum(id)).toBe(10);
    });

    it('is enforced by the database: negative balance, bad type and zero amount fail', async () => {
      const id = await createAccount();
      await expect(
        db.query('UPDATE accounts SET balance = -1 WHERE id = $1', [id]),
      ).rejects.toThrow();
      await expect(
        db.query(
          `INSERT INTO transactions (account_id, type, amount, description, reference_id)
           VALUES ($1, 'refund', 1, 'x', 'x')`,
          [id],
        ),
      ).rejects.toThrow();
      await expect(
        db.query(
          `INSERT INTO transactions (account_id, type, amount, description, reference_id)
           VALUES ($1, 'credit', 0, 'x', 'x')`,
          [id],
        ),
      ).rejects.toThrow();
    });

    it('never overdraws under 20 parallel debits (balance 100, debit 10 each)', async () => {
      const id = await createAccount();
      await tx(id, 'credit', 100).expect(201);
      const results = await Promise.all(Array.from({ length: 20 }, () => tx(id, 'debit', 10)));
      const ok = results.filter((r) => r.status === 201).length;
      const rejected = results.filter((r) => r.status === 422).length;
      expect(ok).toBe(10);
      expect(rejected).toBe(10);
      expect(await balanceOf(id)).toBe(0);
      expect(await ledgerSum(id)).toBe(0);
    });

    it('does not lose updates under parallel credits', async () => {
      const id = await createAccount();
      await Promise.all(Array.from({ length: 25 }, () => tx(id, 'credit', 4).expect(201)));
      expect(await balanceOf(id)).toBe(100);
      expect(await ledgerSum(id)).toBe(100);
    });

    it('creates exactly one row for parallel submissions of the same reference_id', async () => {
      const id = await createAccount();
      const results = await Promise.all(
        Array.from({ length: 10 }, () => tx(id, 'credit', 25, { reference_id: 'same-ref' })),
      );
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(9);
      expect(await balanceOf(id)).toBe(25);
      const rows = await db.query('SELECT count(*)::int AS c FROM transactions');
      expect(rows[0].c).toBe(1);
    });
  });

  // ---------- 9. bonus: transfers ----------
  describe('POST /transfers', () => {
    const transfer = (body: Record<string, unknown>) => http().post(`${API}/transfers`).send(body);
    let from: string;
    let to: string;

    beforeEach(async () => {
      from = await createAccount('A');
      to = await createAccount('B');
      await tx(from, 'credit', 100).expect(201);
      await tx(to, 'credit', 50).expect(201);
    });

    it('moves 30 from A(100) to B(50) => A 70, B 80, with two linked ledger rows', async () => {
      const res = await transfer({
        from_account_id: from,
        to_account_id: to,
        amount: 30,
        reference_id: 't-1',
      }).expect(201);
      expect(res.body.from.balance).toBe(70);
      expect(res.body.to.balance).toBe(80);
      expect(res.body.from.transaction).toMatchObject({
        type: 'debit',
        transfer_id: res.body.transfer_id,
      });
      expect(res.body.to.transaction).toMatchObject({
        type: 'credit',
        transfer_id: res.body.transfer_id,
      });
      expect(await balanceOf(from)).toBe(70);
      expect(await balanceOf(to)).toBe(80);
      expect(await ledgerSum(from)).toBe(70);
      expect(await ledgerSum(to)).toBe(80);
    });

    it('rejects insufficient balance without changing either account', async () => {
      const res = await transfer({
        from_account_id: from,
        to_account_id: to,
        amount: 500,
        reference_id: 't-2',
      }).expect(422);
      expect(res.body.code).toBe('INSUFFICIENT_BALANCE');
      expect(await balanceOf(from)).toBe(100);
      expect(await balanceOf(to)).toBe(50);
    });

    it('validates accounts and body', async () => {
      const base = { from_account_id: from, to_account_id: to, amount: 10, reference_id: 't-3' };
      const same = await transfer({ ...base, to_account_id: from }).expect(400);
      expect(same.body.code).toBe('SAME_ACCOUNT_TRANSFER');
      const missingTo = await transfer({ ...base, to_account_id: randomUUID() }).expect(404);
      expect(missingTo.body.code).toBe('ACCOUNT_NOT_FOUND');
      await transfer({ ...base, from_account_id: randomUUID() }).expect(404);
      await transfer({ ...base, from_account_id: 'bad' }).expect(400);
      const amount = await transfer({ ...base, amount: 0 }).expect(400);
      expect(amount.body.code).toBe('INVALID_AMOUNT');
      await transfer({ ...base, reference_id: undefined }).expect(400);
      expect(await balanceOf(from)).toBe(100);
      expect(await balanceOf(to)).toBe(50);
    });

    it('is idempotent on reference_id', async () => {
      const body = { from_account_id: from, to_account_id: to, amount: 30, reference_id: 't-4' };
      await transfer(body).expect(201);
      const dup = await transfer(body).expect(409);
      expect(dup.body.code).toBe('DUPLICATE_TRANSACTION');
      expect(await balanceOf(from)).toBe(70);
      expect(await balanceOf(to)).toBe(80);
    });

    it('rolls back both sides when a failure happens mid-transfer (no partial transfer)', async () => {
      await db.query(
        `ALTER TABLE transactions ADD CONSTRAINT tmp_force_fail CHECK (description <> 'FORCE_FAIL') NOT VALID`,
      );
      try {
        const res = await transfer({
          from_account_id: from,
          to_account_id: to,
          amount: 30,
          reference_id: 't-5',
          description: 'FORCE_FAIL',
        });
        expect(res.status).toBeGreaterThanOrEqual(400);
      } finally {
        await db.query('ALTER TABLE transactions DROP CONSTRAINT tmp_force_fail');
      }
      expect(await balanceOf(from)).toBe(100);
      expect(await balanceOf(to)).toBe(50);
      const rows = await db.query('SELECT count(*)::int AS c FROM transactions');
      expect(rows[0].c).toBe(2);
    });

    it('survives opposite parallel transfers without deadlock or lost money', async () => {
      const jobs = Array.from({ length: 10 }, (_, i) =>
        i % 2 === 0
          ? transfer({
              from_account_id: from,
              to_account_id: to,
              amount: 5,
              reference_id: `p-${i}`,
            })
          : transfer({
              from_account_id: to,
              to_account_id: from,
              amount: 5,
              reference_id: `p-${i}`,
            }),
      );
      const results = await Promise.all(jobs);
      expect(results.every((r) => r.status === 201)).toBe(true);
      expect((await balanceOf(from)) + (await balanceOf(to))).toBe(150);
      expect(await balanceOf(from)).toBe(await ledgerSum(from));
      expect(await balanceOf(to)).toBe(await ledgerSum(to));
    });
  });
});
