import { AppError } from "@azadimart/shared";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "./client";
import { returnWindowDays } from "./customer-referrals";
import {
  carts, customerAddresses, loginAttempts, signupBonusClaims, customerWalletEntries, customers, liveChats, loginOtps, orders, pushSubscriptions,
  sessions, supportChats, supportMessages, supportTickets, users, wishlists,
} from "./schema/index";

const IN_PROGRESS = ["PAID", "CONFIRMED", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY"] as const;

/**
 * Deletes a shopper's profile.
 * - Never ordered, contacted support or got the welcome bonus: the account and everything linked to it is removed for good.
 * - Otherwise: orders, invoices and support records must be kept (GST law: 8 years), so the
 *   account is anonymised instead: name, email, mobile, password, addresses, wishlist, cart,
 *   sessions and unused wallet money are removed, and the account can never sign in again.
 *   (A welcome-bonus claim keeps its mobile number so the bonus can't be claimed twice.)
 * Refused while an order is still on its way or inside its return window.
 */
export async function deleteCustomerProfile(db: Database, customerId: string, now = new Date()): Promise<{ mode: "DELETED" | "ANONYMISED"; orders: number }> {
  const [c] = await db.select({ userId: customers.userId }).from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!c) throw new AppError("NOT_FOUND", "Customer not found");
  const since = new Date(now.getTime() - returnWindowDays() * 86_400_000);
  const [busy] = await db.select({
    open: sql<number>`count(*) filter (where ${inArray(orders.status, [...IN_PROGRESS])})::int`,
    inWindow: sql<number>`count(*) filter (where ${orders.status} = 'DELIVERED' and ${orders.deliveredAt} > ${since})::int`,
    all: sql<number>`count(*)::int`,
  }).from(orders).where(eq(orders.customerId, customerId));
  if (Number(busy?.open)) throw new AppError("CONFLICT", `This customer has ${busy!.open} order(s) still in progress. Finish or cancel them first.`);
  if (Number(busy?.inWindow)) throw new AppError("CONFLICT", "This customer has an order still inside its return window. Try again once it closes.");
  const orderCount = Number(busy?.all ?? 0);

  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, c.userId));
  if (user) await db.delete(loginAttempts).where(eq(loginAttempts.email, user.email));
  const [support] = await db.select({
    n: sql<number>`((select count(*) from ${supportTickets} where ${supportTickets.customerId} = ${customerId} or ${supportTickets.requesterUserId} = ${c.userId})
      + (select count(*) from ${supportChats} where ${supportChats.customerId} = ${customerId} or ${supportChats.userId} = ${c.userId})
      + (select count(*) from ${supportMessages} where ${supportMessages.senderUserId} = ${c.userId})
      + (select count(*) from ${liveChats} where ${liveChats.customerId} = ${customerId} or ${liveChats.userId} = ${c.userId})
      + (select count(*) from ${signupBonusClaims} where ${signupBonusClaims.customerId} = ${customerId} and ${signupBonusClaims.status} = 'GRANTED'))::int`,
  }).from(sql`(select 1) one`);

  if (orderCount === 0 && Number(support?.n ?? 0) === 0) {
    await db.transaction(async (tx) => {
      await tx.delete(customers).where(eq(customers.id, customerId)); // addresses, cart, wishlist, wallet, reviews go with it
      await tx.delete(users).where(and(eq(users.id, c.userId), eq(users.role, "CUSTOMER"))); // sessions, OTPs, push go with it
    });
    return { mode: "DELETED", orders: 0 };
  }

  await db.transaction(async (tx) => {
    await tx.update(orders).set({ shippingAddressId: null }).where(eq(orders.customerId, customerId)); // the order keeps its own address copy
    await tx.delete(customerAddresses).where(eq(customerAddresses.customerId, customerId));
    await tx.delete(wishlists).where(eq(wishlists.customerId, customerId));
    await tx.delete(carts).where(eq(carts.customerId, customerId));
    await tx.update(customerWalletEntries).set({ remainingPaise: 0 }).where(eq(customerWalletEntries.customerId, customerId));
    await tx.update(customers).set({ fullName: "Deleted customer", referralCode: null, updatedAt: now }).where(eq(customers.id, customerId));
    await tx.update(users).set({ email: `deleted-${c.userId}@deleted.invalid`, phone: null, phoneVerifiedAt: null, passwordHash: null, status: "DISABLED", updatedAt: now })
      .where(and(eq(users.id, c.userId), eq(users.role, "CUSTOMER")));
    await tx.delete(sessions).where(eq(sessions.userId, c.userId));
    await tx.delete(loginOtps).where(eq(loginOtps.userId, c.userId));
    await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, c.userId));
  });
  return { mode: "ANONYMISED", orders: orderCount };
}
