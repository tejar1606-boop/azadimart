import { requireApiAccess } from "@azadimart/auth";
import { cartItems, carts, createDatabase, customerAddresses, deliveryQuote } from "@azadimart/database";
import { AppError, FREE_DELIVERY_FROM_PAISE, toApiError } from "@azadimart/shared";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The courier charge for the cart (or the "buy now" items) to one of the shopper's addresses. Charged only on orders under ₹301. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const session = await requireApiAccess(request, "storefront", ["CUSTOMER"]);
    if (!session.customerId) throw new AppError("UNAUTHORIZED", "Customer profile required");
    const url = new URL(request.url);
    const addressId = url.searchParams.get("addressId") ?? "";
    const variantIds = (url.searchParams.get("variantIds") ?? "").split(",").filter((id) => UUID.test(id));
    if (!UUID.test(addressId)) throw new AppError("VALIDATION_ERROR", "Choose a delivery address");
    const db = createDatabase();
    const address = (await db.select({ city: customerAddresses.city, state: customerAddresses.state }).from(customerAddresses)
      .where(and(eq(customerAddresses.id, addressId), eq(customerAddresses.customerId, session.customerId))).limit(1))[0];
    if (!address) throw new AppError("NOT_FOUND", "Shipping address not found");
    const cart = (await db.select({ id: carts.id }).from(carts).where(eq(carts.customerId, session.customerId)).limit(1))[0];
    const lines = cart ? await db.select({ variantId: cartItems.variantId, quantity: cartItems.quantity }).from(cartItems)
      .where(variantIds.length ? and(eq(cartItems.cartId, cart.id), inArray(cartItems.variantId, variantIds)) : eq(cartItems.cartId, cart.id)) : [];
    // Only Cash on Delivery is open at checkout today.
    const quote = await deliveryQuote(db, { lines, to: address, cod: true });
    return NextResponse.json({ feePaise: quote.feePaise, parcels: quote.parcels, freeFromPaise: FREE_DELIVERY_FROM_PAISE }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
