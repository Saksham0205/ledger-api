# API Reference

Base URL: `http://localhost:3000/api/v1` (health check: `http://localhost:3000/health`). All API
requests and responses use JSON. Amounts and balances are numbers with at most 2 decimal places.

## Try requests in Postman

1. Start the API with `npm run start:dev`.
2. In Postman, choose **Import → Raw text**, paste one of the cURL commands below, and import it.
   Alternatively, create a request manually using the method and URL shown in each section.
3. For POST requests, choose **Body → raw → JSON** when entering the body manually.
4. Run **Create account** first. Copy its response `id` and replace `ACCOUNT_ID` in later URLs.
   For a transfer, create two accounts and replace both `FROM_ACCOUNT_ID` and `TO_ACCOUNT_ID`.

The commands use `curl` for Postman import. In Windows PowerShell, run them in a terminal as
`curl.exe` (PowerShell has a `curl` alias). Replace the account ID placeholders before running.

## 1. Create account

`POST /accounts`

```bash
curl --location 'http://localhost:3000/api/v1/accounts' --header 'Content-Type: application/json' --data '{"name":"Alice Johnson"}'
```

`201 Created`

```json
{ "id": "3f1c1d1e-8c1a-4b53-9d6e-0f2c8b2a1c11", "name": "Alice Johnson", "balance": 0, "created_at": "2026-10-26T10:00:00.000Z" }
```

The client cannot set `id`, `balance`, or `created_at`. Errors: 400 `VALIDATION_ERROR` or
`INVALID_REQUEST_BODY`.

## 2. Add a credit or debit

`POST /accounts/ACCOUNT_ID/transactions`

Credit:

```bash
curl --location 'http://localhost:3000/api/v1/accounts/ACCOUNT_ID/transactions' --header 'Content-Type: application/json' --data '{"type":"credit","amount":100,"description":"Initial deposit","reference_id":"alice-deposit-001"}'
```

Debit:

```bash
curl --location 'http://localhost:3000/api/v1/accounts/ACCOUNT_ID/transactions' --header 'Content-Type: application/json' --data '{"type":"debit","amount":30,"description":"Coffee","reference_id":"alice-coffee-001"}'
```

Replace `ACCOUNT_ID` with the ID returned by **Create account**. Each `reference_id` must be unique
per account. A repeated reference returns 409 `DUPLICATE_TRANSACTION` without changing the balance.
A debit above the balance returns 422 `INSUFFICIENT_BALANCE`.

## 3. Get account balance

`GET /accounts/ACCOUNT_ID/balance`

```bash
curl --location 'http://localhost:3000/api/v1/accounts/ACCOUNT_ID/balance'
```

Example response: `{ "account_id": "ACCOUNT_ID", "balance": 70 }`. Errors: 400
`INVALID_ACCOUNT_ID`, 404 `ACCOUNT_NOT_FOUND`.

## 4. List transaction history

`GET /accounts/ACCOUNT_ID/transactions?type=debit&page=1&limit=10`

```bash
curl --location 'http://localhost:3000/api/v1/accounts/ACCOUNT_ID/transactions?type=debit&page=1&limit=10'
```

`type` is optional (`credit` or `debit`); `page` defaults to 1; `limit` defaults to 10 and must be
between 1 and 100. Results are newest first. Errors: 400 `INVALID_PAGINATION`,
`INVALID_TRANSACTION_TYPE`, or `INVALID_ACCOUNT_ID`; 404 `ACCOUNT_NOT_FOUND`.

## 5. Transfer between accounts

`POST /transfers`

```bash
curl --location 'http://localhost:3000/api/v1/transfers' --header 'Content-Type: application/json' --data '{"from_account_id":"FROM_ACCOUNT_ID","to_account_id":"TO_ACCOUNT_ID","amount":30,"reference_id":"transfer-0001","description":"Rent share"}'
```

Replace both account ID placeholders. `description` is optional and defaults to `Transfer`. Both
account balance changes commit together or neither does. Errors: 400 `SAME_ACCOUNT_TRANSFER` or
`VALIDATION_ERROR`, 404 `ACCOUNT_NOT_FOUND`, 409 `DUPLICATE_TRANSACTION`, 422
`INSUFFICIENT_BALANCE`.

## 6. Health check

```bash
curl --location 'http://localhost:3000/health'
```

Example response: `{ "status": "ok", "database": "up" }`.

## Errors

Errors use a consistent JSON format:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "code": "INVALID_AMOUNT",
  "message": "Request validation failed",
  "details": [{ "field": "amount", "message": "amount must be greater than 0" }],
  "path": "/api/v1/accounts/ACCOUNT_ID/transactions",
  "timestamp": "2026-10-26T10:00:00.000Z"
}
```

Common codes: `VALIDATION_ERROR` (400), `INVALID_ACCOUNT_ID` (400), `INVALID_TRANSACTION_TYPE`
(400), `INVALID_AMOUNT` (400), `INVALID_PAGINATION` (400), `INVALID_REQUEST_BODY` (400),
`SAME_ACCOUNT_TRANSFER` (400), `ACCOUNT_NOT_FOUND` (404), `NOT_FOUND` (404),
`DUPLICATE_TRANSACTION` (409), `INSUFFICIENT_BALANCE` (422), and `INTERNAL_ERROR` (500).

Transactions are immutable: there are no update or delete endpoints, and the database rejects direct
`UPDATE` or `DELETE` operations on the transactions table.
