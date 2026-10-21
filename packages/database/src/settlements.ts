import { calculateSettlement, payoutEligibleAt, type SettlementBreakdown } from "@azadimart/shared";
import { sql } from "drizzle-orm";
import type { Database } from "./client";

/**
 * One order item a seller hasn't been paid for yet, with what they'll get.
 * Items qualify once the order is delivered and paid (Cash on Delivery
 * counts as paid on delivery). Returned units are left out; an open return
 * holds the item until it's resolved.
 */
export type SettlementLine = {
  orderItemId: string;
  orderId: string;
  orderNumber: string;
  sellerId: string;
  title: string;
  quantity: number; // units still kept by the customer
  returnedQuantity: number;
  unitPricePaise: number;
  orderedAt: Date;
  deliveredAt: Date;
  eligibleAt: Date;
  openReturn: boolean;
  breakdown: SettlementBreakdown;
};

type Row = {
  order_item_id: string; order_id: string; order_number: string; seller_id: string; title: string;
  quantity: number; returned: number; unit_price_paise: number; seller_discount_paise: number; ordered_at: string; delivered_at: string;
  approved_at: string | null; tax_identity_type: string; open_return: boolean; shipping_fee_paise: number; in_bonus_free: boolean;
};

export async function unpaidSettlementLines(db: Pick<Database, "execute">, options: { sellerId?: string } = {}): Promise<SettlementLine[]> {
  const result = await db.execute<Row>(sql`
    select oi.id order_item_id, oi.order_id, o.order_number, oi.seller_id, oi.title, oi.quantity, oi.unit_price_paise, oi.seller_discount_paise,
      o.created_at ordered_at, o.delivered_at, s.approved_at, s.tax_identity_type,
      -- LOIMART shipping fee for this seller's parcel, charged once on its first item.
      case when oi.id = (select oi2.id from order_items oi2 where oi2.order_id = oi.order_id and oi2.seller_id = oi.seller_id order by oi2.created_at, oi2.id limit 1)
        -- Only the part the seller's courier wallet didn't already pay.
        then coalesce((select sh.shipping_fee_paise - sh.wallet_paid_paise from shipments sh where sh.order_id = oi.order_id and sh.seller_id = oi.seller_id and sh.shipped_by = 'LOIMART' and sh.status <> 'CANCELLED' limit 1), 0)
        else 0 end::int shipping_fee_paise,
      -- Ordered inside an extra commission-free period (referral bonus).
      exists(select 1 from seller_commission_free_periods fp where fp.seller_id = oi.seller_id and o.created_at >= fp.starts_at and o.created_at < fp.ends_at) in_bonus_free,
      coalesce((select sum(ri.quantity) from return_items ri join returns r on r.id = ri.return_id
        where ri.order_item_id = oi.id and r.status in ('RECEIVED', 'REFUNDED')), 0)::int returned,
      exists(select 1 from return_items ri join returns r on r.id = ri.return_id
        where ri.order_item_id = oi.id and r.status in ('REQUESTED', 'APPROVED', 'PICKUP_SCHEDULED')) open_return
    from order_items oi
    join orders o on o.id = oi.order_id
    join sellers s on s.id = oi.seller_id
    where o.status = 'DELIVERED' and o.delivered_at is not null
      and exists (select 1 from payments p where p.order_id = o.id and p.status in ('CAPTURED', 'PARTIALLY_REFUNDED'))
      and not exists (select 1 from payout_items pi where pi.order_item_id = oi.id)
      ${options.sellerId ? sql`and oi.seller_id = ${options.sellerId}` : sql``}
    order by o.delivered_at, o.order_number`);
  return result.rows.flatMap((row) => {
    const quantity = Math.max(0, row.quantity - row.returned);
    if (quantity === 0) return [];
    const orderedAt = new Date(row.ordered_at), deliveredAt = new Date(row.delivered_at);
    return [{
      orderItemId: row.order_item_id, orderId: row.order_id, orderNumber: row.order_number, sellerId: row.seller_id, title: row.title,
      quantity, returnedQuantity: row.returned, unitPricePaise: row.unit_price_paise, orderedAt, deliveredAt,
      eligibleAt: payoutEligibleAt(deliveredAt), openReturn: row.open_return,
      breakdown: calculateSettlement({
        grossPaise: row.unit_price_paise * quantity, orderedAt,
        // The seller's coupon share, for the units they keep (returned units take theirs back).
        sellerDiscountPaise: Math.round((row.seller_discount_paise * quantity) / Math.max(1, row.quantity)),
        sellerApprovedAt: row.approved_at ? new Date(row.approved_at) : null,
        gstRegistered: row.tax_identity_type === "GSTIN",
        shippingFeePaise: row.shipping_fee_paise,
        inBonusFreePeriod: row.in_bonus_free,
      }),
    }];
  });
}
