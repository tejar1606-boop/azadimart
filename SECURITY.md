# AzadiMart — Security Specification

## Core
Use least privilege, secure defaults, server-side authorization, input validation, auditability and defense in depth.

## Roles
CUSTOMER, SELLER, ADMIN, SUPER_ADMIN plus scoped operational roles such as QC_ADMIN, FINANCE_ADMIN, OPERATIONS_ADMIN and SUPPORT_ADMIN.

## Authentication
- secure session cookies
- HttpOnly
- Secure in production
- SameSite protection
- expiration and revocation
- rate-limited authentication
- MFA for privileged admin accounts where supported

Never store plaintext passwords.

## Authorization
Every protected request checks:
1. authentication
2. role/permission
3. resource ownership
4. input validation

Never use a browser-supplied sellerId/customerId as the authorization source.

## Customer isolation
Customers can access only their own profile, addresses, cart, wishlist, orders, returns and support tickets.

## Seller isolation
Sellers can access only their own catalog, variants, inventory, orders, returns, payouts, documents and support tickets.

## Admin security
Privileged actions require appropriate roles and must be audited:
seller approval/suspension, product QC, refunds, payouts, role changes, theme publishing/rollback, security changes.

## Passwords and sessions
Use Argon2id or an approved secure password-hashing mechanism. Use short-lived, single-use password reset tokens. Never put session tokens in URLs.

## Input and output
Validate all client-controlled data. Never expose stack traces, SQL, secrets or internal infrastructure details in production responses.

## XSS/CSRF
Sanitize rich text and URLs. Do not allow arbitrary JavaScript in seller A+ content or theme settings. Use CSRF protections appropriate for cookie sessions.

## File uploads
Validate actual file signatures/type, MIME, extension, size, dimensions and duration. Allow only supported media. Keep seller/customer documents private.

## Database
Use parameterized queries. Do not expose database credentials to browsers. Prefer least-privilege service accounts.

## Payments
Verify provider webhooks, enforce idempotency, never trust browser payment status, and do not handle raw card data unless explicitly required by a compliant design.

## Secrets
Never commit .env. Store production secrets in the deployment secret manager. Do not put secrets in logs, audit records or client responses.

## Rate limiting
Protect authentication, OTP, password reset, uploads, search abuse, checkout, payments, refunds and admin login.

## Security headers
Use HTTPS and appropriate CSP, HSTS, X-Content-Type-Options, Referrer-Policy and Permissions-Policy settings.

## Logging and audit
Use request IDs and safe structured logs. Audit privileged operations without storing credentials or tokens.

## Webhooks
Verify signature → validate payload → check unique event ID → process transactionally → record result.

## Production
Keep development, staging and production credentials/data separate. Enable backups, monitoring and incident response.

## Testing
Test authentication bypass, IDOR, XSS, CSRF, injection, upload abuse, brute force, privilege escalation, payment replay and webhook replay.

## Definition of done
No feature is security-complete until authorization, validation, safe errors, logging and relevant security tests pass.
