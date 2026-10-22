import { isInterStateSupply, splitGstInclusive } from "@azadimart/shared";
import { sql } from "drizzle-orm";
import type { Database } from "./client";

const IST_MS = 330 * 60_000;
/** A month ("2026-10") as India-time start and end. */
export function monthRange(month: string) {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]) - 1;
  return { start: new Date(Date.UTC(y, mo, 1) - IST_MS), end: new Date(Date.UTC(y, mo + 1, 1) - IST_MS) };
}

type Line = { seller_id: string; sold: number; tcs: number; tds: number; gst_rate_bps: number | null; buyer_state: string | null };
type SellerRow = { id: string; legal_name: string; store_name: string; gstin: string | null; pan: string | null; tax_identity_type: string; state: string | null };

export type TaxReportRow = {
  sellerId: string; legalName: string; storeName: string; gstin: string | null; pan: string | null; state: string | null;
  /** Value of supplies settled this month and returned after settlement (incl. GST), and the value before GST TCS is on. */
  suppliesPaise: number; returnsPaise: number; netPaise: number; netTaxablePaise: number;
  tcsPaise: number; tcsIgstPaise: number; tcsCgstPaise: number; tcsSgstPaise: number;
  /** Income-tax 194-O: amount it was deducted on and the TDS. */
  tdsBasePaise: number; tdsPaise: number;
};

/**
 * TCS (GST section 52, for LOIMART's GSTR-8) and TDS (194-O) for one month,
 * per seller. Supplies count in the month they were settled (TCS is deducted
 * from that payout); goods returned after settlement reduce the month they
 * came back in. TCS splits into CGST + SGST for same-state supplies, IGST otherwise.
 */
export async function tcsTdsReport(db: Pick<Database, "execute">, month: string, options: { sellerId?: string } = {}) {
  const range = monthRange(month);
  if (!range) return null;
  const seller = options.sellerId ? sql`and p.seller_id = ${options.sellerId}` : sql``;
  const sellerAdj = options.sellerId ? sql`and sa.seller_id = ${options.sellerId}` : sql``;
  const [supplies, returned, sellers] = await Promise.all([
    db.execute<Line>(sql`
      select p.seller_id, (pi.gross_amount_paise - pi.seller_discount_paise)::int sold, pi.tcs_paise::int tcs, pi.tds_paise::int tds, oi.gst_rate_bps, o.shipping_address_snapshot->>'state' buyer_state
      from payout_items pi join payouts p on p.id = pi.payout_id join order_items oi on oi.id = pi.order_item_id join orders o on o.id = oi.order_id
      where p.created_at >= ${range.start} and p.created_at < ${range.end} ${seller}`),
    db.execute<Line>(sql`
      select sa.seller_id, sa.sold_paise::int sold, sa.tcs_paise::int tcs, 0 tds, oi.gst_rate_bps, o.shipping_address_snapshot->>'state' buyer_state
      from settlement_adjustments sa join order_items oi on oi.id = sa.order_item_id join orders o on o.id = oi.order_id
      where sa.created_at >= ${range.start} and sa.created_at < ${range.end} ${sellerAdj}`),
    db.execute<SellerRow>(sql`
      select s.id, s.legal_name, s.store_name, s.gstin, s.pan, s.tax_identity_type, coalesce(nullif(ss.shipping_settings->'pickup'->>'state', ''), s.business_state) state
      from sellers s left join seller_settings ss on ss.seller_id = s.id`),
  ]);
  const info = new Map(sellers.rows.map((s) => [s.id, s]));
  const rows = new Map<string, TaxReportRow>();
  const add = (line: Line, sign: 1 | -1) => {
    const s = info.get(line.seller_id);
    if (!s) return;
    const row = rows.get(s.id) ?? { sellerId: s.id, legalName: s.legal_name, storeName: s.store_name, gstin: s.gstin, pan: s.pan, state: s.state, suppliesPaise: 0, returnsPaise: 0, netPaise: 0, netTaxablePaise: 0, tcsPaise: 0, tcsIgstPaise: 0, tcsCgstPaise: 0, tcsSgstPaise: 0, tdsBasePaise: 0, tdsPaise: 0 };
    if (sign === 1) { row.suppliesPaise += line.sold; row.tdsBasePaise += line.sold; row.tdsPaise += line.tds; } else row.returnsPaise += line.sold;
    row.netPaise += sign * line.sold;
    row.netTaxablePaise += sign * (s.tax_identity_type === "GSTIN" ? splitGstInclusive(line.sold, line.gst_rate_bps ?? 1800).taxablePaise : line.sold);
    row.tcsPaise += sign * line.tcs;
    if (isInterStateSupply(s.state, line.buyer_state)) row.tcsIgstPaise += sign * line.tcs;
    else { const half = Math.floor(line.tcs / 2); row.tcsCgstPaise += sign * half; row.tcsSgstPaise += sign * (line.tcs - half); }
    rows.set(s.id, row);
  };
  for (const l of supplies.rows) add(l, 1);
  for (const l of returned.rows) add(l, -1);
  const list = [...rows.values()].sort((a, b) => a.legalName.localeCompare(b.legalName));
  const total = (k: keyof TaxReportRow) => list.reduce((n, r) => n + (typeof r[k] === "number" ? (r[k] as number) : 0), 0);
  return {
    month, rows: list,
    totals: { suppliesPaise: total("suppliesPaise"), returnsPaise: total("returnsPaise"), netTaxablePaise: total("netTaxablePaise"), tcsPaise: total("tcsPaise"), tcsIgstPaise: total("tcsIgstPaise"), tcsCgstPaise: total("tcsCgstPaise"), tcsSgstPaise: total("tcsSgstPaise"), tdsPaise: total("tdsPaise") },
  };
}

/** The last 12 months of TCS and TDS deducted for one seller (India-time months), newest first. */
export async function sellerTaxSummary(db: Pick<Database, "execute">, sellerId: string) {
  const r = await db.execute<{ month: string; sold: number; tcs: number; tds: number; tcs_back: number }>(sql`
    with m as (
      select to_char(p.created_at at time zone 'Asia/Kolkata', 'YYYY-MM') as month, sum(pi.gross_amount_paise - pi.seller_discount_paise)::int as sold, sum(pi.tcs_paise)::int as tcs, sum(pi.tds_paise)::int as tds, 0 as tcs_back
      from payout_items pi join payouts p on p.id = pi.payout_id where p.seller_id = ${sellerId} and p.created_at > now() - interval '13 months' group by 1
      union all
      select to_char(sa.created_at at time zone 'Asia/Kolkata', 'YYYY-MM'), -sum(sa.sold_paise)::int, 0, 0, sum(sa.tcs_paise)::int
      from settlement_adjustments sa where sa.seller_id = ${sellerId} and sa.created_at > now() - interval '13 months' group by 1
    )
    select m.month, sum(m.sold)::int as sold, sum(m.tcs)::int as tcs, sum(m.tds)::int as tds, sum(m.tcs_back)::int as tcs_back from m group by m.month order by m.month desc limit 12`);
  return r.rows.map((x) => ({ month: x.month, netSalesPaise: x.sold, tcsPaise: x.tcs - x.tcs_back, tdsPaise: x.tds }));
}
