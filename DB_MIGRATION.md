# AzadiMart — Real Neon Database Integration

The repository contains a reviewed Drizzle migration for the current AzadiMart schema.

## Migration safety

The current generated migration creates 50 tables and contains no DROP TABLE, DROP COLUMN, or DROP SCHEMA statements.

Do not run a production migration until you have confirmed that `DATABASE_URL` points to the intended Neon project.

## Local procedure

1. Set the real Neon connection string in your local environment:

```bash
export DATABASE_URL='postgresql://...'
```

Never commit the value and never paste credentials into chat.

2. Run the connection preflight:

```bash
pnpm db:check
```

Expected result:

```
Neon connection: OK
Migration table: ...
```

3. Apply the reviewed migration:

```bash
pnpm db:migrate
```

The migration command now performs the same preflight first and refuses placeholder/local fallback URLs.

4. Verify the result in Neon SQL Editor using read-only inspection before connecting the deployed applications.

## Deployment

Set `DATABASE_URL` in the deployment platform's server-side environment variables. Do not expose it with a `NEXT_PUBLIC_` prefix and do not put it in browser code.

Keep development, staging, and production Neon databases separate.
