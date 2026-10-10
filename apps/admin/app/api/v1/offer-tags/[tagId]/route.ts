import { requireApiAccess } from "@azadimart/auth";
import { auditLogs, createDatabase, offerTags } from "@azadimart/database";
import { AppError, offerTagSchema, toApiError, uuidSchema } from "@azadimart/shared";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

async function tagIdOf(params: Promise<{ tagId: string }>) {
  const { tagId } = await params;
  if (!uuidSchema.safeParse(tagId).success) throw new AppError("NOT_FOUND", "Tag not found");
  return tagId;
}

/** Replace a tag's settings (label, colour, products, dates, priority, on/off). */
export async function PATCH(request: Request, { params }: { params: Promise<{ tagId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const tagId = await tagIdOf(params);
    const input = offerTagSchema.parse(await request.json());
    const db = createDatabase();
    const tag = (await db.update(offerTags).set({
      label: input.label, tone: input.tone, scope: input.scope, priority: input.priority, isActive: input.isActive,
      startsAt: input.startsAt ? new Date(input.startsAt) : new Date(), endsAt: input.endsAt ? new Date(input.endsAt) : null, updatedAt: new Date(),
    }).where(eq(offerTags.id, tagId)).returning())[0];
    if (!tag) throw new AppError("NOT_FOUND", "Tag not found");
    await db.insert(auditLogs).values({ actorUserId: principal.userId, action: "OFFER_TAG_UPDATED", entityType: "offer_tag", entityId: tag.id, metadata: { label: tag.label, isActive: tag.isActive } });
    return NextResponse.json({ tag });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ tagId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const tagId = await tagIdOf(params);
    const db = createDatabase();
    const removed = (await db.delete(offerTags).where(eq(offerTags.id, tagId)).returning({ id: offerTags.id, label: offerTags.label }))[0];
    if (!removed) throw new AppError("NOT_FOUND", "Tag not found");
    await db.insert(auditLogs).values({ actorUserId: principal.userId, action: "OFFER_TAG_DELETED", entityType: "offer_tag", entityId: removed.id, metadata: { label: removed.label } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
