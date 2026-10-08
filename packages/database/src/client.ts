import { neonConfig, Pool, type PoolClient } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema/index";

// The WebSocket driver is required for interactive transactions (db.transaction);
// the neon-http driver throws "No transactions support in neon-http driver".
// Prefer Node's built-in WebSocket (Node 22+): the `ws` package breaks when
// bundled by Next.js ("Connection terminated unexpectedly").
neonConfig.webSocketConstructor = globalThis.WebSocket ?? ws;

export type Database = ReturnType<typeof createDatabase>;

const CONNECT_ATTEMPTS = 3;
const RETRY_DELAY_MS = 250;

/** WebSocket failures surface as a bare ErrorEvent ("[object ErrorEvent]"); turn them into a readable Error. */
function toConnectionError(error: unknown): Error {
  if (error instanceof Error) return error;
  const detail = (error as { message?: string; error?: { message?: string } } | null)?.error?.message ?? (error as { message?: string } | null)?.message;
  return new Error("Database connection failed" + (detail ? `: ${detail}` : ""));
}

/**
 * Retries opening a connection when the network blips (e.g. a dropped WebSocket
 * to Neon). Only the connect step is retried, before any query is sent, so a
 * retry can never run a statement twice.
 */
class RetryingPool extends Pool {
  override connect(): Promise<PoolClient>;
  override connect(callback: (err: Error, client: PoolClient, done: (release?: unknown) => void) => void): void;
  override connect(callback?: (err: Error, client: PoolClient, done: (release?: unknown) => void) => void): Promise<PoolClient> | void {
    const attempt = async (remaining: number): Promise<PoolClient> => {
      try {
        return await super.connect();
      } catch (error) {
        if (remaining <= 1) throw toConnectionError(error);
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * (CONNECT_ATTEMPTS - remaining + 1)));
        return attempt(remaining - 1);
      }
    };
    const connecting = attempt(CONNECT_ATTEMPTS);
    if (!callback) return connecting;
    connecting.then(
      (client) => callback(undefined as unknown as Error, client, (release?: unknown) => client.release(release as boolean | Error | undefined)),
      (error: Error) => callback(error, undefined as unknown as PoolClient, () => undefined),
    );
  }
}

const pools = new Map<string, Pool>();

function getPool(databaseUrl: string): Pool {
  let pool = pools.get(databaseUrl);
  if (!pool) {
    pool = new RetryingPool({ connectionString: databaseUrl });
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
