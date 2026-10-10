import { requireApiAccess } from "@azadimart/auth";
import { auditLogs, categories, createDatabase, inventory, mediaAssets, productMedia, productVariants, products, sellers } from "@azadimart/database";
import { AppError, adminProductArrangeSchema, toApiError, uuidSchema } from "@azadimart/shared";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

type Db = ReturnType<typeof createDatabase>;

/** Live products in storefront order: arranged ones by position, then the rest newest first. */
function liveInStoreOrder(db: Pick<Db, "select">) {
  return db.select({ id: products.id, categoryId: products.categoryId, position: products.position })
    .from(products).where(eq(products.status, "LIVE"))
    .orderBy(asc(products.position), desc(products.createdAt), asc(products.id));
}

/** Live products in their current storefront order, optionally for one category. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const categoryId = new URL(request.url).searchParams.get("categoryId");
    if (categoryId && !uuidSchema.safeParse(categoryId).success) throw new AppError("VALIDATION_ERROR", "Invalid category");
    const db = createDatabase();
    const ordered = (await liveInStoreOrder(db)).filter((p) => !categoryId || p.categoryId === categoryId);
    const ids = ordered.map((p) => p.id);
    if (!ids.length) return NextResponse.json({ items: [] });
    const [details, media, variants] = await Promise.all([
      db.select({ id: products.id, title: products.title, slug: products.slug, sellerName: sellers.storeName, categoryName: categories.name })
        .from(products).innerJoin(sellers, eq(sellers.id, products.sellerId)).innerJoin(categories, eq(categories.id, products.categoryId))
        .where(inArray(products.id, ids)),
      db.select({ productId: productMedia.productId, key: mediaAssets.storageKey, sortOrder: productMedia.sortOrder })
        .from(productMedia).innerJoin(mediaAssets, eq(mediaAssets.id, productMedia.mediaAssetId))
        .where(and(inArray(productMedia.productId, ids), eq(productMedia.kind, "IMAGE"))),
      db.select({ productId: productVariants.productId, pricePaise: productVariants.pricePaise, onHand: inventory.onHand, reserved: inventory.reserved })
        .from(productVariants).leftJoin(inventory, eq(inventory.variantId, productVariants.id))
        .where(and(inArray(productVariants.productId, ids), eq(productVariants.isActive, true))),
    ]);
    return NextResponse.json({
      items: ordered.map((p) => {
        const d = details.find((x) => x.id === p.id)!;
        const cover = media.filter((m) => m.productId === p.id).sort((a, b) => a.sortOrder - b.sortOrder)[0];
        const vs = variants.filter((v) => v.productId === p.id);
        return {
          ...d,
          arranged: p.position !== null,
          coverImageUrl: cover ? "/media/" + cover.key : null,
          pricePaise: vs.length ? Math.min(...vs.map((v) => v.pricePaise)) : null,
          available: vs.reduce((sum, v) => sum + Math.max(0, (v.onHand ?? 0) - (v.reserved ?? 0)), 0),
        };
      }),
    });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

/**
 * Save a new order. The products sent take over the same storefront slots they
 * already occupy, in the new order, so arranging one category never moves
 * products from other categories. Every live product then gets a fixed position.
 */
export async function PUT(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const input = adminProductArrangeSchema.parse(await request.json());
    const db = createDatabase();
    const saved = await db.transaction(async (tx) => {
      // Serialise concurrent arrangements so two admins can't interleave slot assignments.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('azadimart:arrange-products'))`);
      const all = await liveInStoreOrder(tx);
      const scope = all.filter((p) => !input.categoryId || p.categoryId === input.categoryId);
      const scopeIds = new Set(scope.map((p) => p.id));
      if (input.productIds.length !== scope.length || input.productIds.some((id) => !scopeIds.has(id))) {
        throw new AppError("CONFLICT", "The product list changed (a product went live or was hidden). Reload and arrange again.");
      }
      const slots = all.map((p, index) => (scopeIds.has(p.id) ? index : -1)).filter((index) => index >= 0);
      const next = all.map((p) => p.id);
      slots.forEach((slot, i) => { next[slot] = input.productIds[i]!; });
      const values = sql.join(next.map((id, index) => sql`(${id}::uuid, ${index + 1}::int)`), sql`, `);
      await tx.execute(sql`update products set position = v.pos from (values ${values}) as v(id, pos) where products.id = v.id`);
      await tx.insert(auditLogs).values({ actorUserId: principal.userId, action: "PRODUCTS_ARRANGED", entityType: "category", entityId: input.categoryId ?? "all", metadata: { order: input.productIds } });
      return next.length;
    });
    return NextResponse.json({ ok: true, arranged: saved });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
