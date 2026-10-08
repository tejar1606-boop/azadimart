import { themeRevisions, type Database } from "@azadimart/database";
import { desc, eq } from "drizzle-orm";

export type DraftSnapshot = {
  kind: "draft";
  themeSettings: Record<string, unknown>;
  sections: Array<{ type: string; isVisible: boolean; settings: Record<string, unknown> }>;
};

/**
 * Drafts live only in theme_revisions; page_sections and the theme/page status
 * are the published homepage and change only on publish. The pending draft is
 * the newest revision when it is a draft (a publish revision supersedes it).
 */
export async function getPendingDraft(db: Pick<Database, "select">, themeId: string): Promise<DraftSnapshot | null> {
  const latest = (await db.select({ snapshot: themeRevisions.snapshot }).from(themeRevisions)
    .where(eq(themeRevisions.themeId, themeId))
    .orderBy(desc(themeRevisions.createdAt))
    .limit(1))[0];
  const snapshot = latest?.snapshot as Partial<DraftSnapshot> | undefined;
  return snapshot?.kind === "draft" && Array.isArray(snapshot.sections) ? (snapshot as DraftSnapshot) : null;
}
