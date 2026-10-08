import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema/index";

// The WebSocket driver is required for interactive transactions (db.transaction);
// the neon-http driver throws "No transactions support in neon-http driver".
neonConfig.webSocketConstructor = ws;

export type Database = ReturnType<typeof createDatabase>;

const pools = new Map<string, Pool>();

function getPool(databaseUrl: string): Pool {
  let pool = pools.get(databaseUrl);
  if (!pool) {
    pool = new Pool({ connectionString: databaseUrl });
    pools.set(databaseUrl, pool);
  }
  return pool;
}

export function createDatabase(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }
  return drizzle(getPool(databaseUrl), { schema });
}
