# AzadiMart — Development Team Operating Manual

## Purpose

This document defines responsibilities and collaboration rules for the AzadiMart product, engineering, design, QA, security, operations, finance and growth teams.

The goal is a production-grade marketplace with clear ownership, secure boundaries, predictable interfaces and tested releases.

## Core rules

- Never expose secrets.
- Never commit .env files.
- Never bypass authentication or authorization.
- Never modify another team's module without coordination.
- Never claim a feature is complete unless relevant tests pass.
- Never use fake production credentials.
- Use migrations for database changes.
- Preserve working functionality unless a change intentionally replaces it.
- Document important architecture decisions.
- Do not copy competitor code, branding or proprietary assets.

## Technology standards

Primary stack:
- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- PostgreSQL / Neon
- Object storage + CDN
- Secure authentication + RBAC
- GitHub
- CI/CD

Use TypeScript strict mode where practical.

## Repository layout

```text
apps/
  storefront/
  seller/
  admin/

packages/
  ui/
  database/
  auth/
  storage/
  payments/
  logistics/
  validation/
  shared/

docs/
scripts/
```

## Team ownership

### Tech Lead / Architect
Owns system architecture, cross-module decisions, major schema/API changes, technical standards and conflict resolution.

### Developer 1 — Database & Backend
Owns PostgreSQL/Neon, migrations, repositories, transactions, constraints and backend data-access foundations.

### Developer 2 — Auth & Core APIs
Owns authentication, sessions, RBAC, authorization middleware, validation, common API utilities, rate limiting and API contracts.

### Developer 3 — Customer Storefront
Owns `apps/storefront`: navigation, search, categories, product pages, gallery/video, A+ display, cart, checkout, account, orders, returns and support UI.

### Developer 4 — Seller Centre
Owns `apps/seller`: onboarding/KYC, catalog, variants, inventory, media, A+ content, QC submission, orders, shipments, returns, payouts and support.

### Developer 5 — Admin & Platform
Owns `apps/admin`: dashboard, sellers, catalog, QC, orders, logistics, finance, customers, support, marketing, Online Store and audit/security UI.

### UI Designer 1 — Customer
Owns customer journeys, mobile UX, product detail UX, checkout and accessibility.

### UI Designer 2 — Seller/Admin
Owns seller/admin workflows, tables, forms and theme-editor UX.

### Graphic Designer 1 — Brand
Owns brand system, visual identity and original brand assets.

### Graphic Designer 2 — Marketing
Owns banners, campaign graphics and promotional artwork using original/licensed assets.

### QA 1 — Frontend
Owns responsive, browser, accessibility and UI regression testing.

### QA 2 — Backend/API
Owns API, database, authorization, concurrency and integration testing.

### QA 3 — E2E/Release
Owns critical end-to-end flows and release sign-off.

### Security Engineer
Owns threat modeling, RBAC review, isolation, upload security, XSS/CSRF, secrets, webhooks, dependency/security controls and security testing.

### Logistics Lead
Owns courier/provider strategy, serviceability, shipment lifecycle, tracking and returns logistics.

### Marketplace Operations
Owns seller onboarding rules, catalog/QC policies, marketplace operating rules and escalation processes.

### Customer Support
Owns support workflows, SLAs, escalation and customer communication requirements.

### Finance/Tax
Owns payment reconciliation, fees, seller payouts, refunds and tax/accounting requirements. Tax decisions require appropriate professional review.

### Growth/Marketing
Owns acquisition, campaigns, conversion, retention and analytics requirements.

## Work ownership

Every change has one primary owner.

When a change crosses boundaries:
1. Identify the owner.
2. Define the interface.
3. Implement only the necessary changes.
4. Test the integration.

Never silently change another team's API or database assumptions.

## Git workflow

Use:
- main
- develop
- feature/*

Prefer pull requests for significant changes.

Commit messages should describe the change, for example:
- feat: add seller product creation
- fix: prevent cross-seller access
- feat: add product media upload

Do not use vague messages such as "update" or "final".

## Database rules

- All schema changes use reviewed migrations.
- Use transactions for critical workflows.
- Use numeric types for money.
- Enforce integrity with constraints and indexes.
- Never patch production tables manually to fix application bugs.
- Do not expose database credentials to clients.

## API rules

Every protected endpoint must define:
- authentication
- authorization
- ownership rules
- request validation
- response contract
- safe error behavior
- relevant tests

Seller and customer identifiers from the browser are never trusted for authorization.

## Media rules

Product gallery:
- maximum 8 images
- maximum 1 standard product video

Validate actual file type, MIME, extension, size, dimensions and video duration.

Store production media in object storage, not local filesystem.

Keep seller/customer documents private.

## Theme editor rules

The admin Online Store editor must support:
- add section
- remove section
- reorder section
- edit section
- upload media
- save draft
- preview
- publish
- revision history
- rollback

Do not allow arbitrary executable JavaScript through theme settings.

## Security rules

- No secrets in Git.
- No passwords in logs.
- No stack traces in production responses.
- Enforce RBAC server-side.
- Enforce seller/customer isolation.
- Verify payment and logistics webhooks.
- Use idempotency for duplicate-prone financial operations.
- Rate-limit sensitive endpoints.

## Testing rules

Before merge/release as applicable:
- lint
- typecheck
- unit tests
- integration/API tests
- security tests
- end-to-end tests
- production build

A feature is not complete if critical tests fail.

## Agent execution rules

Before modifying code:
1. Read ARCHITECTURE.md
2. Read DATABASE_DESIGN.md
3. Read API_DESIGN.md
4. Read SECURITY.md
5. Read TESTING.md
6. Read AGENTS.md

Before implementation:
- Identify feature owner.
- Identify affected tables.
- Identify affected APIs.
- Identify affected apps/packages.
- State the implementation plan.

During implementation:
- Modify only required files.
- Do not rewrite unrelated modules.
- Do not remove working functionality without approval.
- Do not introduce fake credentials.
- Do not bypass security controls.
- Do not change schema without a migration.

After implementation:
- Run relevant checks.
- Report exactly what changed.
- Report remaining known issues.

If an architectural conflict is discovered, request Tech Lead review.

## Definition of done

A feature is complete only when applicable:
- code works
- database changes are migrated
- API contract is correct
- authorization is enforced
- validation exists
- desktop/mobile behavior is checked
- loading/empty/error states exist
- tests pass
- security implications are reviewed
- documentation is updated
