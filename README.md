# Transaction Ledger API

A NestJS API for creating accounts, posting credit and debit transactions, reading balances and
paginated transaction history, and transferring money atomically between accounts.

- **Stack:** NestJS 11, TypeScript, PostgreSQL, TypeORM migrations, class-validator, Swagger/OpenAPI,
  Jest and Supertest.
- **Database guarantees:** transactions, row locks, exact `NUMERIC` money, database constraints,
  idempotency and an immutable transaction ledger.

## Documentation

- [API Reference](docs/API.md): endpoints, request and response examples, validation rules, errors,
  and cURL requests that can be imported into Postman.
- [Assignment assumptions](ASSUMPTIONS.md): how ambiguous requirements and scope decisions were
  interpreted.
- [Swagger UI](http://localhost:3000/docs): interactive API documentation while the app is running.
  The OpenAPI document is served by the application at `/docs-json`.

## Requirements

- Node.js 20 or newer and npm
- Either Docker for local PostgreSQL, or the Supabase project / another PostgreSQL 13+ database

## Run with Docker PostgreSQL

The checked-in `.env.example` is configured for Docker. Copy it to `.env`:

```powershell
Copy-Item .env.example .env
```

The database-related values in `.env.example` are:

```dotenv
PORT=3000
DATABASE_URL=postgres://postgres:postgres@localhost:5433/ledger
DATABASE_SSL=false
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5433/ledger_test
```

Start PostgreSQL and the API:

```powershell
docker compose up -d
npm install
npm run migration:run
npm run start:dev
```

Docker exposes PostgreSQL on port `5433`; the compose setup creates both `ledger` and `ledger_test`.
`TEST_DATABASE_URL` is used only by the end-to-end test suite. Keep it pointed at the local test
database, never at a database containing data you need to preserve.

## Run with Supabase PostgreSQL

This repository's Supabase project is [`ledger-api`](https://supabase.com/dashboard/project/reztuawzdiehjlihddni)
in `ap-south-1`. This API connects to PostgreSQL through TypeORM; `DATABASE_URL` must be a PostgreSQL
connection string, not the project's `https://<project-ref>.supabase.co` API URL.

In the Supabase dashboard, open **Connect** and select **Session pooler**. Put the connection details
in `.env` as follows (use the exact host shown in the dashboard and your database password):

```dotenv
PORT=3000
DATABASE_URL=postgresql://postgres.reztuawzdiehjlihddni:YOUR_URL_ENCODED_DB_PASSWORD@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
DATABASE_SSL=true
```

Use **Session pooler** on port `5432`. The API uses database transactions and row locks, so the
transaction pooler on port `6543` is not suitable. Do not add `?pgbouncer=true`. If your password has
reserved URL characters, percent-encode them. Keep the real connection string in `.env` or your
deployment secret store; never commit it.

Then install dependencies, apply migrations, and start the API:

```powershell
npm install
npm run migration:run
npm run start:dev
```

The migration command prepares the private TypeORM migration schema before applying pending schema
migrations. It is safe to run again; TypeORM skips migrations already recorded as applied. Keep
`TEST_DATABASE_URL` pointed at Docker's local `ledger_test` database when running end-to-end tests.

## Deploy to Render with Supabase

The [`render.yaml`](render.yaml) Blueprint creates the web service. In Render, create a Blueprint
from this repository and set `DATABASE_URL` to the Supabase **Session pooler** URL as a secret. The
Blueprint sets `DATABASE_SSL=true`, runs compiled migrations, starts the API, and checks `/health`.
Once deployed, the API base path is `/api/v1` and Swagger is at `/docs`.

The Blueprint currently uses Render's free web service plan and runs migrations during service
startup. It is configured for one service instance; move migrations to a one-time deploy step before
scaling to multiple instances.

## Tests

```bash
npm run lint
npm test            # unit tests (no database needed)
npm run test:e2e    # e2e against the `ledger_test` database (needs docker compose up -d)
npm run test:cov
```

The e2e suite (47 tests) runs migrations itself and covers every endpoint, the examples from the
assignment, every error case, rollback/atomicity, immutability, and concurrency (20 parallel debits,
10 parallel identical `reference_id`s, opposite parallel transfers).
It always uses `TEST_DATABASE_URL` and truncates its tables, so never point that at real data.

## Try the API

Paste this block into **Windows PowerShell** after starting the API. It creates an account, saves
the returned ID, posts a credit and debit, then reads the balance and transaction history. Use
`curl.exe` explicitly because PowerShell also defines a `curl` alias.

```powershell
$baseUrl = 'http://localhost:3000/api/v1'
$account = curl.exe -sS -X POST "$baseUrl/accounts" -H 'Content-Type: application/json' --data-raw '{"name":"Alice Johnson"}' | ConvertFrom-Json
$accountId = $account.id
$account

curl.exe -sS -X POST "$baseUrl/accounts/$accountId/transactions" -H 'Content-Type: application/json' --data-raw '{"type":"credit","amount":100,"description":"Initial deposit","reference_id":"alice-deposit-001"}'
curl.exe -sS -X POST "$baseUrl/accounts/$accountId/transactions" -H 'Content-Type: application/json' --data-raw '{"type":"debit","amount":30,"description":"Coffee machine","reference_id":"alice-coffee-001"}'
curl.exe -sS "$baseUrl/accounts/$accountId/balance"
curl.exe -sS "$baseUrl/accounts/$accountId/transactions?type=debit&page=1&limit=10"
```

### Try it in Postman

Use `http://localhost:3000/api/v1` as the base URL. Create an account first, then copy its returned
`id` into the `accountId` part of the transaction, balance, and history URLs. For transfers, create
two accounts and use their IDs. You can import any cURL example from [`docs/API.md`](docs/API.md)
using **Import > Raw text**; set POST bodies to **raw → JSON** when entering them manually.

## Project structure

```
src/
  main.ts, app.setup.ts, app.module.ts
  config/            database options + env checks
  common/            error classes, exception filter, validation mapping, pagination
  database/          data-source (CLI) and migrations
  accounts/          entity, DTOs, service, controller
  transactions/      entity, DTOs, service, controller, balance helper
  transfers/         bonus transfer endpoint
  health/            liveness + DB ping
test/                e2e tests and setup
docs/API.md          API routes, examples and errors
ASSUMPTIONS.md       assignment interpretation and scope decisions
```

Controllers are thin (HTTP only); business rules live in services; DTOs validate input and response
DTOs shape output so entities never leak.

## Design decisions

- **Atomicity.** Posting a transaction runs in one DB transaction: lock the account row, check for a
  duplicate, update the balance, insert the ledger row. Any failure rolls back both.
- **Concurrency.** `SELECT ... FOR UPDATE` serialises writers per account, so parallel debits can
  never overdraw and no update is lost. Transfers lock both rows ordered by id, which avoids deadlocks.
  The debit guard (`balance >= amount`) is also inside the `UPDATE` itself, and `CHECK (balance >= 0)`
  is the last line of defence.
- **Idempotency.** `UNIQUE (account_id, reference_id)`. A repeat returns `409 DUPLICATE_TRANSACTION`
  with the original transaction and changes nothing. If two identical requests race, the unique
  violation is also mapped to the same response, never a 500.
- **Money.** Stored as `NUMERIC(18,2)`; arithmetic happens in Postgres, never in JS floats. Amounts
  accept at most 2 decimals and are capped at 1,000,000,000.
- **Immutability.** There are no PUT/PATCH/DELETE routes for transactions, and a Postgres trigger
  rejects any `UPDATE`/`DELETE` on the table, so even direct SQL cannot change history.
- **Balance consistency.** Balance is a stored column updated in the same DB transaction as the ledger
  row; tests assert it always equals `sum(credits) - sum(debits)`.
- **Errors.** One consistent JSON shape with a machine-readable `code` (see `docs/API.md`). Stack traces
  and SQL are never returned; unexpected errors are logged server-side and returned as a plain 500.
