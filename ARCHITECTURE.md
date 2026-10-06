# AzadiMart — System Architecture

## Product
AzadiMart is an India-focused multi-vendor commerce platform with three experiences:
- Customer: azadimart.com
- Seller: seller.azadimart.com
- Admin: admin.azadimart.com

Roadmap: marketplace → seller subscriptions → farm-to-business procurement → direct sourcing → omnichannel retail.

## Stack
- Next.js + React + TypeScript
- Tailwind CSS + shadcn/ui
- PostgreSQL on Neon
- Object storage + CDN for media
- Secure session authentication + RBAC
- GitHub + CI/CD
- Vercel or equivalent hosting

## Monorepo
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

## Application boundaries
### Storefront
Catalog, search, product detail, media gallery, A+ content, cart, checkout, payments, orders, returns, support.

### Seller
Onboarding/KYC, catalog, variants, inventory, product media, A+ content, QC submission, orders, shipping, returns, payouts, support.

### Admin
Dashboard, sellers, products, QC, orders, logistics, payments, finance, returns, support, marketing, Online Store, audit/security.

## Core flow
Seller registration → verification → approval → product draft → media/A+ → QC → approval → publication → customer purchase → fulfillment → payout.

## Media
Product gallery: up to 8 images + 1 product video. A+ and storefront media use object storage records. Private seller/customer documents must not be public.

## Theme Editor
Admin can edit pages by ordered sections: add/remove/reorder/edit, upload media, save draft, preview, publish, revision history, rollback.

## Integrations
Payment provider abstraction (Razorpay/Cashfree/COD). Logistics abstraction (Shiprocket/Delhivery/Shadowfax).

## Security
Server-side authentication/authorization, seller/customer isolation, validated uploads, safe errors, audit logs, protected secrets.

## Development rule
Database → repository → service → API → validation → tests → frontend. Do not build the whole platform in one change.
