# AzadiMart — API Design

## 1. API Principles

All APIs must follow these principles:

- REST-style HTTP APIs

- JSON responses unless file upload/download requires otherwise

- Server-side authentication

- Server-side authorization

- Strict request validation

- Consistent error format

- Pagination for list endpoints

- Idempotency for financial operations

- No secrets in responses

- No direct client access to database credentials

Base API:

```text

/api