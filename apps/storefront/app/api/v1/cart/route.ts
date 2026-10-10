import { getSessionPrincipal, enforceRateLimit } from "@azadimart/auth";
import {
  carts,
  cartItems,
  createDatabase,
  inventory,
  mediaAssets,
  productMedia,
  productVariants,
  products,
} from "@azadimart/database";
import { AppError, cartItemMutationSchema, cartRemoveSchema, toApiError } from "@azadimart/shared";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

async function getCustomer(request: Request) {
  const db = createDatabase();
  const principal = await getSessionPrincipal(request, db);
  if (!principal || principal.role !== "CUSTOMER" || !principal.customerId) {
    throw new AppError("UNAUTHORIZED", "Please sign in to use your cart");
  }
  return { db, customerId: principal.customerId };
}

async function ensureCart(db: ReturnType<typeof createDatabase>, customerId: string) {
  const existing = (await db.select().from(carts).where(eq(carts.customerId, customerId)).limit(1))[0];
  if (existing) return existing;
  const inserted = (await db.insert(carts).values({ customerId }).returning())[0];
  if (!inserted) throw new AppError("INTERNAL", "Cart creation failed", undefined, false);
  return inserted;
}

async function readCart(db: ReturnType<typeof createDatabase>, customerId: string) {
  const cart = await ensureCart(db, customerId);
  const rows = await db
    .select({
      id: cartItems.id,
      variantId: cartItems.variantId,
      quantity: cartItems.quantity,
      productId: products.id,
      slug: products.slug,
      title: products.title,
      variantTitle: productVariants.title,
      sku: productVariants.sku,
      pricePaise: productVariants.pricePaise,
      productStatus: products.status,
      variantActive: productVariants.isActive,
      onHand: inventory.onHand,
      reserved: inventory.reserved,
      mediaStorageKey: mediaAssets.storageKey,
      mediaAltText: mediaAssets.altText,
      mediaKind: productMedia.kind,
      mediaSortOrder: productMedia.sortOrder,
    })
    .from(cartItems)
    .innerJoin(productVariants, eq(productVariants.id, cartItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
    .leftJoin(productMedia, eq(productMedia.productId, products.id))
    .leftJoin(mediaAssets, eq(mediaAssets.id, productMedia.mediaAssetId))
    .where(eq(cartItems.cartId, cart.id));

  const grouped = new Map<string, (typeof rows)[number] & { media: Array<{ storageKey: string; altText: string | null; kind: string }> }>();
  for (const row of rows) {
    const current = grouped.get(row.id) ?? { ...row, media: [] };
    if (row.mediaStorageKey && row.mediaKind && !current.media.some((media) => media.storageKey === row.mediaStorageKey)) {
      current.media.push({ storageKey: row.mediaStorageKey, altText: row.mediaAltText, kind: row.mediaKind });
    }
    grouped.set(row.id, current);
  }

  const items = [...grouped.values()].map((row) => ({
    ...row,
    media: row.media.sort((left, right) => {
      const leftOrder = rows.find((candidate) => candidate.id === row.id && candidate.mediaStorageKey === left.storageKey)?.mediaSortOrder ?? 0;
      const rightOrder = rows.find((candidate) => candidate.id === row.id && candidate.mediaStorageKey === right.storageKey)?.mediaSortOrder ?? 0;
      return leftOrder - rightOrder;
    }),
    // Unlisted products and inactive variants count as unavailable.
    availableQuantity: row.productStatus === "LIVE" && row.variantActive ? Math.max(0, (row.onHand ?? 0) - (row.reserved ?? 0)) : 0,
    lineTotalPaise: row.pricePaise * row.quantity,
  })).map((item) => ({ ...item, isAvailable: item.availableQuantity >= item.quantity }));

  return {
    cartId: cart.id,
    items,
    // Matches what checkout and coupon validation will accept.
    subtotalPaise: items.filter((item) => item.isAvailable).reduce((sum, item) => sum + item.lineTotalPaise, 0),
    unavailableCount: items.filter((item) => !item.isAvailable).length,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
  };
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const { db, customerId } = await getCustomer(request);
    return NextResponse.json(await readCart(db, customerId));
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const { db, customerId } = await getCustomer(request);
    await enforceRateLimit(db, request, "cart", { subject: customerId });
    const input = cartItemMutationSchema.parse(await request.json());
    const cart = await ensureCart(db, customerId);

    const productRows = await db
      .select({
        variantId: productVariants.id,
        productId: products.id,
        pricePaise: productVariants.pricePaise,
        productStatus: products.status,
        variantActive: productVariants.isActive,
        onHand: inventory.onHand,
        reserved: inventory.reserved,
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
      .where(eq(productVariants.id, input.variantId))
      .limit(1);

    const variant = productRows[0];
    if (!variant || variant.productStatus !== "LIVE" || !variant.variantActive) {
      throw new AppError("NOT_FOUND", "Product variant is not available");
    }

    const availableQuantity = Math.max(0, (variant.onHand ?? 0) - (variant.reserved ?? 0));
    if (availableQuantity < input.quantity) {
      throw new AppError("UNPROCESSABLE", "Requested quantity is not available");
    }

    const existing = (await db.select({ id: cartItems.id, quantity: cartItems.quantity })
      .from(cartItems)
      .where(and(eq(cartItems.cartId, cart.id), eq(cartItems.variantId, input.variantId)))
      .limit(1))[0];

    const nextQuantity = (existing?.quantity ?? 0) + input.quantity;
    if (nextQuantity > availableQuantity) {
      throw new AppError("UNPROCESSABLE", "Cart quantity exceeds available stock");
    }

    if (existing) {
      await db.update(cartItems).set({ quantity: nextQuantity, updatedAt: new Date() }).where(eq(cartItems.id, existing.id));
    } else {
      await db.insert(cartItems).values({ cartId: cart.id, variantId: input.variantId, quantity: input.quantity });
    }

    return NextResponse.json(await readCart(db, customerId), { status: 200 });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

export async function PUT(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const { db, customerId } = await getCustomer(request);
    await enforceRateLimit(db, request, "cart", { subject: customerId });
    const input = cartItemMutationSchema.parse(await request.json());
    const cart = await ensureCart(db, customerId);

    const item = (await db.select({ id: cartItems.id, quantity: cartItems.quantity })
      .from(cartItems)
      .where(and(eq(cartItems.cartId, cart.id), eq(cartItems.variantId, input.variantId)))
      .limit(1))[0];
    if (!item) throw new AppError("NOT_FOUND", "Cart item not found");

    const stockRows = await db
      .select({ onHand: inventory.onHand, reserved: inventory.reserved, isActive: productVariants.isActive, status: products.status })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
      .where(eq(productVariants.id, input.variantId))
      .limit(1);
    const stock = stockRows[0];
    const availableQuantity = Math.max(0, (stock?.onHand ?? 0) - (stock?.reserved ?? 0));
    // Reducing quantity is always allowed, so a line above current stock can be fixed with "−".
    const reducing = input.quantity < item.quantity;
    if (!stock || stock.status !== "LIVE" || !stock.isActive || (!reducing && input.quantity > availableQuantity)) {
      throw new AppError("UNPROCESSABLE", "Requested quantity is not available");
    }

    await db.update(cartItems).set({ quantity: input.quantity, updatedAt: new Date() }).where(eq(cartItems.id, item.id));
    return NextResponse.json(await readCart(db, customerId));
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const { db, customerId } = await getCustomer(request);
    await enforceRateLimit(db, request, "cart", { subject: customerId });
    const input = cartRemoveSchema.parse(await request.json());
    const cart = await ensureCart(db, customerId);
    await db.delete(cartItems).where(and(eq(cartItems.cartId, cart.id), eq(cartItems.variantId, input.variantId)));
    return NextResponse.json(await readCart(db, customerId));
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}