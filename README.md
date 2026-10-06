# AzadiMart

Production-grade Indian multi-vendor marketplace. This repository is a **pnpm + Turborepo** monorepo.

| Surface | Host | App |
| --- | --- | --- |
| Customer storefront | azadimart.com | `apps/storefront` |
| Seller portal | seller.azadimart.com | `apps/seller` |
| Admin console | admin.azadimart.com | `apps/admin` |

Read **[ARCHITECTURE.md](./ARCHITECTURE.md)** and **[AGENTS.md](./AGENTS.md)** before changing code.

## Stack

Next.js, React, TypeScript, Tailwind CSS, shadcn/ui (`packages/ui`), PostgreSQL on Neon (`packages/database`), API-first contracts in `packages/shared`.

## Local development

```bash
pnpm install
cp .env.example .env.local   # fill locally; never commit
pnpm typecheck
pnpm lint
pnpm test
pnpm dev
```

- Storefront: http://localhost:3000
- Seller: http://localhost:3001
- Admin: http://localhost:3002

Database migrations live in `packages/database`. Apply them only against an environment you control:

```bash
pnpm db:generate
pnpm db:migrate
```

## Quality gate

```bash
pnpm verify
```

Runs typecheck, lint, tests, production builds, route file checks, and API contract tests.
