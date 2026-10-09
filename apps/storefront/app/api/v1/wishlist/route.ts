import { getSessionPrincipal } from "@azadimart/auth";
import { createDatabase, mediaAssets, productMedia, productVariants, products, wishlistItems, wishlists } from "@azadimart/database";
import { AppError, toApiError, uuidSchema } from "@azadimart/shared";
import { and, asc, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function customer(request: Request) {
  const db = createDatabase();
  const principal = await getSessionPrincipal(request, db);
  if (!principal?.customerId) throw new AppError("UNAUTHORIZED", "Please sign in to save products");
  return { db, customerId: principal.customerId };
}

/** Race-safe get-or-create (unique on customer_id). */
async function ensureWishlist(db: ReturnType<typeof createDatabase>, customerId: string) {
  await db.insert(wishlists).values({ customerId, name: "Default" }).onConflictDoNothing({ target: wishlists.customerId });
  const wishlist = (await db.select().from(wishlists).where(eq(wishlists.customerId, customerId)).limit(1))[0];
  if (!wishlist) throw new AppError("INTERNAL", "Wishlist unavailable", undefined, false);
  return wishlist;
}

async function getWishlist(db: ReturnType<typeof createDatabase>, customerId: string) {
  const wishlist = await ensureWishlist(db, customerId);

  const rows = await db.select({
    id: wishlistItems.productId,
    title: products.title,
    slug: products.slug,
    pricePaise: productVariants.pricePaise,
    mediaStorageKey: mediaAssets.storageKey,
    mediaAltText: mediaAssets.altText,
  }).from(wishlistItems)
    .innerJoin(products, eq(products.id, wishlistItems.productId))
    .innerJoin(productVariants, eq(productVariants.productId, products.id))
    .leftJoin(productMedia, and(eq(productMedia.productId, products.id), eq(productMedia.kind, "IMAGE")))
    .leftJoin(mediaAssets, eq(mediaAssets.id, productMedia.mediaAssetId))
    .where(and(eq(wishlistItems.wishlistId, wishlist.id), eq(products.status, "LIVE"), eq(productVariants.isActive, true)))
    .orderBy(desc(wishlistItems.createdAt), asc(productMedia.sortOrder));

  const items = new Map<string, typeof rows[number]>();
  for (const row of rows) if (!items.has(row.id)) items.set(row.id, row);
  return { wishlistId: wishlist.id, items: [...items.values()] };
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const { db, customerId } = await customer(request);
    return NextResponse.json(await getWishlist(db, customerId));
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const { db, customerId } = await customer(request);
    const body = await request.json();
    const productId = typeof body?.productId === "string" ? body.productId : "";
    if (!uuidSchema.safeParse(productId).success) throw new AppError("VALIDATION_ERROR", "Product is required");

    const wishlist = await ensureWishlist(db, customerId);
    const existing = (await db.select().from(wishlistItems).where(and(eq(wishlistItems.wishlistId, wishlist.id), eq(wishlistItems.productId, productId))).limit(1))[0];
    if (existing) {
      await db.delete(wishlistItems).where(and(eq(wishlistItems.wishlistId, wishlist.id), eq(wishlistItems.productId, productId)));
    } else {
      const live = (await db.select({ id: products.id }).from(products).where(and(eq(products.id, productId), eq(products.status, "LIVE"))).limit(1))[0];
      if (!live) throw new AppError("NOT_FOUND", "Product not found");
      await db.insert(wishlistItems).values({ wishlistId: wishlist.id, productId }).onConflictDoNothing();
    }

    return NextResponse.json(await getWishlist(db, customerId));
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const { db, customerId } = await customer(request);
    const body = await request.json();
    const productId = typeof body?.productId === "string" ? body.productId : "";
    const wishlist = (await db.select().from(wishlists).where(eq(wishlists.customerId, customerId)).limit(1))[0];
    if (wishlist && productId) await db.delete(wishlistItems).where(and(eq(wishlistItems.wishlistId, wishlist.id), eq(wishlistItems.productId, productId)));
    return NextResponse.json(wishlist ? await getWishlist(db, customerId) : { wishlistId: null, items: [] });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}