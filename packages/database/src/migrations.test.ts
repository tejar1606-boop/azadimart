import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(__dirname, "..", "drizzle");
const journal = JSON.parse(readFileSync(join(migrationsDir, "meta", "_journal.json"), "utf8")) as {
  entries: Array<{ idx: number; tag: string; when: number }>;
};
const sqlTags = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .map((file) => file.slice(0, -".sql".length))
  .sort();

describe("drizzle migrations", () => {
  it("registers every SQL file in the journal, in order", () => {
    expect(journal.entries.map((entry) => entry.tag)).toEqual(sqlTags);
    journal.entries.forEach((entry, index) => expect(entry.idx).toBe(index));
  });

  it("uses strictly increasing journal timestamps", () => {
    for (let i = 1; i < journal.entries.length; i += 1) {
      expect(journal.entries[i]!.when).toBeGreaterThan(journal.entries[i - 1]!.when);
    }
  });

  it("separates multi-statement migrations with statement breakpoints", () => {
    for (const tag of sqlTags) {
      const sql = readFileSync(join(migrationsDir, `${tag}.sql`), "utf8");
      const chunks = sql.split("--> statement-breakpoint");
      for (const chunk of chunks) {
        const withoutDollarBlocks = chunk.replace(/\$\$[\s\S]*?\$\$/g, "");
        const statements = withoutDollarBlocks.split(";").filter((part) => part.trim().length > 0);
        expect(statements.length, `${tag} has multiple statements without a breakpoint`).toBeLessThanOrEqual(1);
      }
    }
  });
});
