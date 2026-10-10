import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL?.trim();

if (!url) {
  console.error("DATABASE_URL is required. Set it in your local environment; never commit it.");
  process.exit(1);
}

if (/USER:PASSWORD@HOST|replace-with|postgres:postgres@localhost/i.test(url)) {
  console.error("DATABASE_URL looks like a placeholder or local fallback. Refusing to continue.");
  process.exit(1);
}

try {
  const sql = neon(url);
  const result = await sql`
    select
      current_database() as database_name,
      current_user as database_user,
      current_schema() as schema_name,
      now() as server_time
  `;

  const row = result[0];
  console.log("Neon connection: OK");
  console.log(`database=${row.database_name} user=${row.database_user} schema=${row.schema_name}`);
  console.log(`server_time=${row.server_time}`);

  const migrationRows = await sql`
    select to_regclass('public.__drizzle_migrations') as migration_table
  `;

  console.log(
    migrationRows[0]?.migration_table
      ? "Migration table: present"
      : "Migration table: not present yet",
  );
} catch (error) {
  console.error("Neon connection: FAILED");
  console.error(error instanceof Error ? error.message : "Unknown database error");
  process.exit(1);
}
