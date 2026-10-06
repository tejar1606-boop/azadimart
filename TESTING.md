# AzadiMart — Testing Strategy

## Release rule
No feature is complete until relevant automated tests pass and desktop/mobile behavior is checked.

## Customer
Test registration, login/logout, profile, addresses, navigation, search, product detail, 1:1 media gallery, video, A+ content, wishlist, cart, checkout, payment/COD, orders, tracking, cancellation, returns, refunds and support.

## Seller
Test onboarding/KYC, documents, dashboard, product draft/editing, variants, inventory, 8-image/1-video media rules, A+ content, QC submission/rejection/approval, orders, shipment, returns, payouts and support.

## Admin
Test authentication, RBAC, dashboard, sellers, products, QC, orders, logistics, finance, returns, support, marketing, banners, media, theme editor, publish, revisions, rollback and audit logs.

## API
Test valid/invalid requests, missing fields, wrong types, unauthorized/forbidden access, ownership checks, duplicate requests, rate limiting and safe errors.

Expected status coverage:
200, 201, 204, 400, 401, 403, 404, 409, 422, 429, 500.

## Database
Test migrations, foreign keys, unique constraints, non-negative inventory, numeric precision, transaction rollback, data isolation and referential integrity.

## Media
Test:
- 8 images allowed; 9 rejected
- 1 video allowed; 2 rejected
- valid JPG/PNG/WebP/MP4/WebM
- invalid executable/script/archive
- wrong MIME/extension
- oversized and malformed media
- secure private document access

## Mobile
Test 320, 375, 390 and 414 px widths plus tablet/desktop.

Verify:
- responsive navigation
- product 1:1 gallery
- horizontal thumbnail scrolling
- image/video viewer
- forms
- seller/admin tables and controls
- checkout

## Security
Test authentication bypass, IDOR, RBAC, XSS, CSRF, SQL injection, upload abuse, session abuse, brute force, privilege escalation, payment replay and webhook replay.

## Payments
Use provider sandbox/test environments. Test success, failure, cancellation, duplicate webhook, invalid signature, timeout and COD.

## Orders
Test cart → checkout → payment → order → seller acceptance → packing → shipment → delivery → return/refund.

Test concurrency when purchasing the last available unit.

## Logistics
Test serviceability, shipment creation, labels, tracking, cancellation, provider webhooks and returns.

## Payouts
Test deductions, refunds before/after payout where supported, duplicate payout requests, failed payout and settlement accuracy.

## Theme editor
Test add/remove/reorder/edit section, image/video upload, draft, preview, publish, revision and rollback.

If title/subtitle/CTA is empty, storefront must not restore placeholder defaults.

## Accessibility
Test keyboard navigation, focus states, labels, alt text, screen readers, contrast and modal behavior.

## Performance
Test page/API/database response time, image/video loading and behavior on slow networks.

## Error states
Every important screen needs loading, empty, error and success states.

## E2E critical flows
Customer:
browse → product → cart → checkout → payment → order → delivery → return/refund.

Seller:
register → KYC → approval → product → media → A+ → QC → publish → order → ship → payout.

Admin:
login → seller verification → QC → product approval → order operations → finance → storefront publish → audit.

## CI gate
install → lint → typecheck → unit tests → integration tests → API tests → security checks → build.

Production deployment must fail if required checks fail.
