import { requireApiAccess } from "@azadimart/auth";
import { auditLogs, createDatabase, offerTags, products, sellers } from "@azadimart/database";
import { PRICE_DROP_TAG_DAYS, offerTagSchema, toApiError } from "@azadimart/shared";
import { and, desc, eq, gt, isNotNull } from "drizzle-orm";
import { NextResponse } from "next/server";

/** All offer tags, plus products currently showing an automatic "Price drop" tag. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const db = createDatabase();
    const since = new Date(Date.now() - PRICE_DROP_TAG_DAYS * 24 * 60 * 60 * 1000);
    const [tags, drops] = await Promise.all([
      db.select().from(offerTags).orderBy(desc(offerTags.isActive), desc(offerTags.priority), desc(offerTags.createdAt)),
      db.select({ id: products.id, title: products.title, slug: products.slug, sellerName: sellers.storeName, droppedAt: products.priceDroppedAt, beforePaise: products.priceBeforeDropPaise })
        .from(products).innerJoin(sellers, eq(sellers.id, products.sellerId))
        .where(and(isNotNull(products.priceDroppedAt), gt(products.priceDroppedAt, since), eq(products.status, "LIVE")))
        .orderBy(desc(products.priceDroppedAt)).limit(100),
    ]);
    return NextResponse.json({ items: tags, priceDrops: drops, priceDropDays: PRICE_DROP_TAG_DAYS });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const input = offerTagSchema.parse(await request.json());
    const db = createDatabase();
    const tag = (await db.insert(offerTags).values({
      label: input.label, tone: input.tone, scope: input.scope, priority: input.priority, isActive: input.isActive,
      startsAt: input.startsAt ? new Date(input.startsAt) : new Date(), endsAt: input.endsAt ? new Date(input.endsAt) : null,
      createdByUserId: principal.userId,
    }).returning())[0]!;
    await db.insert(auditLogs).values({ actorUserId: principal.userId, action: "OFFER_TAG_CREATED", entityType: "offer_tag", entityId: tag.id, metadata: { label: tag.label, scope: tag.scope } });
    return NextResponse.json({ tag }, { status: 201 });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
