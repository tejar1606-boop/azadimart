import { spawnSync } from "node:child_process";

const url = process.env.DATABASE_URL?.trim();

if (!url) {
  console.error("DATABASE_URL is required for database migrations.");
  process.exit(1);
}

if (/USER:PASSWORD@HOST|replace-with|postgres:postgres@localhost/i.test(url)) {
  console.error("DATABASE_URL looks like a placeholder or local fallback. Migration refused.");
  process.exit(1);
}

const preflight = spawnSync(process.execPath, ["scripts/db-preflight.mjs"], {
  stdio: "inherit",
  env: process.env,
});

if (preflight.status !== 0) {
  process.exit(preflight.status ?? 1);
}

console.log("Starting reviewed Drizzle migration against the configured Neon database...");

const migration = spawnSync(
  "pnpm",
  ["--filter", "@azadimart/database", "migrate"],
  {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  },
);

process.exit(migration.status ?? 1);
