# AzadiMart — Development Team Operating Manual

## 1. Purpose

This document defines how the AzadiMart engineering, design, operations, security, finance and QA responsibilities work together.

The objective is to build a production-grade marketplace without duplicated work, conflicting changes, insecure shortcuts or untested features.

---

# 2. Core Rules

Every team member must follow these rules:

1. Never expose secrets.

2. Never commit `.env` files.

3. Never bypass authentication or authorization.

4. Never modify another team's module without coordination.

5. Never mark a feature complete without testing it.

6. Never use fake production credentials.

7. Never directly modify production data for convenience.

8. Use migrations for database changes.

9. Preserve backward compatibility where practical.

10. Document important architectural decisions.

---

# 3. Technology Standards

Primary stack:

- Next.js

- React

- TypeScript

- Tailwind CSS

- shadcn/ui

- PostgreSQL

- Neon PostgreSQL

- Object storage

- GitHub

- Automated CI/CD

Development must use TypeScript strict mode where practical.

---

# 4. Repository Ownership

Repository:

```text

azadimart

# 36. Agent Execution Rules

Before modifying code:

1. Read [ARCHITECTURE.md](http://ARCHITECTURE.md)

2. Read DATABASE_[DESIGN.md](http://DESIGN.md)

3. Read API_[DESIGN.md](http://DESIGN.md)

4. Read [SECURITY.md](http://SECURITY.md)

5. Read [TESTING.md](http://TESTING.md)

6. Read [AGENTS.md](http://AGENTS.md)

Before implementation:

- Identify the feature owner.

- Identify affected database tables.

- Identify affected APIs.

- Identify affected applications/packages.

- Explain the implementation plan.

During implementation:

- Modify only the required files.

- Do not rewrite unrelated modules.

- Do not remove working functionality without approval.

- Do not introduce fake data or credentials.

- Do not bypass security controls.

- Do not change database schema without a migration.

After implementation:

- Run lint.

- Run TypeScript checks.

- Run relevant tests.

- Run the production build.

- Report exactly what changed.

- Report any remaining known issue.

If an architectural conflict is discovered, stop and request Tech Lead review rather than making an arbitrary decision.

Never claim a feature is complete unless the relevant tests pass.