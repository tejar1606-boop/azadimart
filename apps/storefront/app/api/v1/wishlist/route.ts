import { getSessionPrincipal } from "@azadimart/auth";
import { createDatabase, mediaAssets, productMedia, productVariants, products, wishlistItems, wishlists } from "@azadimart/database";
import { AppError, toApiError } from "@azadimart/shared";
import { and, asc, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function customer(request: Request) {
  const db = createDatabase();
  const principal = await getSessionPrincipal(request, db);
  if (!principal?.customerId) throw new AppError("UNAUTHORIZED", "Customer session required");
  return { db, customerId: principal.customerId };
}

async function getWishlist(db: ReturnType<typeof createDatabase>, customerId: string) {
  let wishlist = (await db.select().from(wishlists).where(eq(wishlists.customerId, customerId)).limit(1))[0];
  if (!wishlist) wishlist = (await db.insert(wishlists).values({ customerId, name: "Default" }).returning())[0];
  if (!wishlist) throw new AppError("INTERNAL", "Wishlist unavailable", undefined, false);

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
    if (!productId) throw new AppError("UNPROCESSABLE", "Product is required");

    let wishlist = (await db.select().from(wishlists).where(eq(wishlists.customerId, customerId)).limit(1))[0];
    if (!wishlist) wishlist = (await db.insert(wishlists).values({ customerId, name: "Default" }).returning())[0];
    if (!wishlist) throw new AppError("INTERNAL", "Wishlist unavailable", undefined, false);

    const existing = (await db.select().from(wishlistItems).where(and(eq(wishlistItems.wishlistId, wishlist.id), eq(wishlistItems.productId, productId))).limit(1))[0];
    if (existing) await db.delete(wishlistItems).where(and(eq(wishlistItems.wishlistId, wishlist.id), eq(wishlistItems.productId, productId)));
    else await db.insert(wishlistItems).values({ wishlistId: wishlist.id, productId });

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