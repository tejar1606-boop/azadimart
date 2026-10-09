import { requireApiAccess } from "@azadimart/auth";
import { cartItems, createDatabase, mediaAssets, productMedia, productVariants, products } from "@azadimart/database";
import { toApiError } from "@azadimart/shared";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

const IDLE: Record<string, number> = { "1h": 3600, "24h": 86400, "3d": 3 * 86400, "7d": 7 * 86400 };
/** An order within this many days of a reminder counts as recovered. */
const RECOVERY_DAYS = 7;

type CartRow = { cart_id: string; customer_id: string; full_name: string; email: string; phone: string | null; last_activity: string; last_reminder_at: string | null; reminder_count: number; item_count: number; value_paise: number };

/**
 * Abandoned carts: signed-in customers' carts with items and no activity for
 * the chosen time (default 1 hour, up to 60 days old), plus 30-day recovery
 * figures. Reminders are recorded on the cart; an order within 7 days of a
 * reminder counts as recovered.
 */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const url = new URL(request.url);
    const idle = IDLE[url.searchParams.get("idle") ?? "1h"] ?? IDLE["1h"]!;
    const q = url.searchParams.get("q")?.trim().slice(0, 100) ?? "";
    const like = `%${q.replace(/[%_\\]/g, (m) => "\\" + m)}%`;
    const db = createDatabase();

    const activity = sql`
      with activity as (
        select c.id cart_id, c.customer_id, c.last_reminder_at, c.reminder_count,
               greatest(c.updated_at, max(ci.updated_at)) last_activity,
               count(ci.id)::int item_count, sum(ci.quantity * v.price_paise)::int value_paise
        from carts c join cart_items ci on ci.cart_id = c.id join product_variants v on v.id = ci.variant_id
        group by c.id
      )`;
    const [rows, summary] = await Promise.all([
      db.execute<CartRow>(sql`${activity}
        select a.*, cu.full_name, u.email, u.phone
        from activity a join customers cu on cu.id = a.customer_id join users u on u.id = cu.user_id
        where a.last_activity < now() - make_interval(secs => ${idle}) and a.last_activity > now() - interval '60 days'
          ${q ? sql`and (cu.full_name ilike ${like} or u.email ilike ${like} or coalesce(u.phone, '') ilike ${like})` : sql``}
        order by a.last_activity desc limit 200`),
      db.execute<{ abandoned: number; value_paise: number; reminded: number; recovered: number; recovered_paise: number }>(sql`${activity}
        select
          (select count(*)::int from activity where last_activity between now() - interval '30 days' and now() - interval '1 hour') abandoned,
          (select coalesce(sum(value_paise), 0)::int from activity where last_activity between now() - interval '30 days' and now() - interval '1 hour') value_paise,
          (select count(*)::int from carts where last_reminder_at > now() - interval '30 days') reminded,
          (select count(distinct c.id)::int from carts c join orders o on o.customer_id = c.customer_id
             where c.last_reminder_at > now() - interval '30 days' and o.created_at > c.last_reminder_at
               and o.created_at < c.last_reminder_at + make_interval(days => ${RECOVERY_DAYS}) and o.status <> 'CANCELLED') recovered,
          (select coalesce(sum(o.grand_total_paise), 0)::int from carts c join orders o on o.customer_id = c.customer_id
             where c.last_reminder_at > now() - interval '30 days' and o.created_at > c.last_reminder_at
               and o.created_at < c.last_reminder_at + make_interval(days => ${RECOVERY_DAYS}) and o.status <> 'CANCELLED') recovered_paise`),
    ]);

    const ids = rows.rows.map((r) => r.cart_id);
    const items = ids.length ? await db.select({
      cartId: cartItems.cartId, quantity: cartItems.quantity, title: products.title, slug: products.slug,
      variantTitle: productVariants.title, pricePaise: productVariants.pricePaise, imageKey: mediaAssets.storageKey, sortOrder: productMedia.sortOrder,
    }).from(cartItems).innerJoin(productVariants, eq(productVariants.id, cartItems.variantId)).innerJoin(products, eq(products.id, productVariants.productId))
      .leftJoin(productMedia, and(eq(productMedia.productId, products.id), eq(productMedia.kind, "IMAGE")))
      .leftJoin(mediaAssets, eq(mediaAssets.id, productMedia.mediaAssetId))
      .where(inArray(cartItems.cartId, ids)).orderBy(asc(cartItems.createdAt), asc(productMedia.sortOrder)) : [];

    const s = summary.rows[0]!;
    return NextResponse.json({
      summary: { abandoned: s.abandoned, valuePaise: s.value_paise, reminded: s.reminded, recovered: s.recovered, recoveredPaise: s.recovered_paise, recoveryRate: s.reminded ? Math.round((s.recovered / s.reminded) * 100) : 0, recoveryDays: RECOVERY_DAYS },
      items: rows.rows.map((r) => ({
        cartId: r.cart_id, customerName: r.full_name, email: r.email, phone: r.phone, lastActivity: r.last_activity,
        lastReminderAt: r.last_reminder_at, reminderCount: r.reminder_count, itemCount: r.item_count, valuePaise: r.value_paise,
        // One line per cart item (first photo only).
        products: items.filter((i) => i.cartId === r.cart_id).filter((i, idx, all) => all.findIndex((x) => x.slug === i.slug && x.variantTitle === i.variantTitle) === idx)
          .map((i) => ({ title: i.title, slug: i.slug, variantTitle: i.variantTitle, quantity: i.quantity, pricePaise: i.pricePaise, imageUrl: i.imageKey ? "/media/" + i.imageKey : null })),
      })),
    });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
