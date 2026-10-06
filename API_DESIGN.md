# AzadiMart — API Design

## Principles
- REST-style APIs under /api
- JSON responses except file transfer
- server-side authentication and authorization
- strict validation
- consistent errors
- pagination
- idempotency for financial/duplicate-prone operations
- no secrets in responses

## Response
Success:
```json
{"success":true,"data":{},"meta":{}}
```

Error:
```json
{"success":false,"error":{"code":"VALIDATION_ERROR","message":"Invalid request","fields":{}}}
```

## Auth
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET /api/auth/me

## Customer
GET/PATCH /api/customers/me
GET/POST/PATCH/DELETE /api/customers/me/addresses/*
GET /api/products
GET /api/products/:id
GET/POST/DELETE /api/wishlist/*
GET/POST/PATCH/DELETE /api/cart/*
POST /api/checkout/validate
POST /api/orders
GET /api/orders
GET /api/orders/:id
POST /api/orders/:id/cancel
POST /api/orders/:id/returns

## Seller
GET /api/seller/me
GET/PATCH /api/seller/products/*
POST /api/seller/products
POST /api/seller/products/:id/submit-qc
GET /api/seller/qc
GET/PATCH /api/seller/inventory/*
GET /api/seller/orders
GET /api/seller/returns
GET /api/seller/payouts
Seller IDs come from authenticated session, not trusted browser input.

## Media and A+
POST/DELETE /api/media/*
GET/POST/PATCH/DELETE /api/seller/products/:productId/aplus/*

Uploads validate actual type, MIME, extension, size, dimensions and video duration.

## Admin QC
GET /api/admin/qc
GET /api/admin/qc/:id
POST /api/admin/qc/:id/approve
POST /api/admin/qc/:id/reject
POST /api/admin/qc/:id/request-changes

## Admin
GET /api/admin/stats
GET /api/admin/orders
GET /api/admin/products
GET /api/admin/sellers
GET /api/admin/customers
GET /api/admin/returns
GET /api/admin/payouts
GET /api/admin/support/tickets
GET /api/admin/audit-logs

## Payments
POST /api/payments/create
POST /api/payments/webhook/:provider
GET /api/payments/:id
Webhook signatures must be verified and events processed idempotently.

## Logistics
GET /api/shipping/serviceability
POST /api/seller/shipments
GET /api/shipments/:id
GET /api/shipments/:id/tracking
POST /api/logistics/webhook/:provider

## Storefront/theme
GET/POST /api/admin/store/themes/*
GET /api/admin/store/pages/:pageId
POST/PATCH/DELETE /api/admin/store/pages/:pageId/sections/*
POST /api/admin/store/pages/:pageId/reorder
POST /api/admin/store/themes/:id/save-draft
POST /api/admin/store/themes/:id/preview
POST /api/admin/store/themes/:id/publish
GET /api/admin/store/themes/:id/revisions
POST /api/admin/store/themes/:id/revisions/:revisionId/rollback
GET/POST /api/admin/store/banners
POST /api/admin/store/media

## Authorization
CUSTOMER → own resources only.
SELLER → own seller resources only.
ADMIN → permitted platform operations.
SUPER_ADMIN → full privileged administration.

## File uploads
Reject executables, scripts, unexpected archives and unsupported media.

## Rate limiting
At minimum: login, registration, password reset/OTP, file upload, checkout, payment creation, refunds, webhooks and admin authentication.

## Health
GET /api/health should return safe status only.

## Definition of done
Every endpoint has authentication/authorization rules, request validation, error handling, tests and documentation.
