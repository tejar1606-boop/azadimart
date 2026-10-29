"use client";

import { rupeesInWords } from "@azadimart/shared";
import { BrandWordmark } from "./brand";

const rs = (paise: number) => "₹" + (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "—");
/** The cycle's last day: the period ends at midnight starting the next cycle. */
const lastDay = (iso: string | null) => (iso ? day(new Date(new Date(iso).getTime() - 60_000).toISOString()) : "—");
const PRINT = `@media print { @page { size: A4; margin: 12mm; } body * { visibility: hidden !important; } .invoice-doc, .invoice-doc * { visibility: visible !important; } .invoice-doc { position: absolute; inset: 0 auto auto 0; width: 100%; box-shadow: none !important; border: 0 !important; } .invoice-noprint { display: none !important; } }`;
const cell = "border border-slate-300 px-2 py-1.5";

function Shell({ title, subtitle, isTest, children }: { title: string; subtitle: string; isTest?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <style>{PRINT}</style>
      <div className="invoice-noprint mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">{subtitle}</p>
        <button type="button" onClick={() => window.print()} className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">Download PDF</button>
      </div>
      <article className="invoice-doc relative mx-auto max-w-[210mm] overflow-hidden border border-slate-300 bg-white p-6 text-[12px] leading-snug text-slate-900 shadow-sm sm:p-8">
        {isTest ? <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center"><span className="-rotate-[24deg] text-[84px] font-black tracking-widest text-red-500/15">TEST</span></div> : null}
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-slate-900 pb-4">
          <h1 className="text-xl font-black uppercase tracking-wide">{title}</h1>
          <BrandWordmark className="text-3xl" />
        </header>
        {children}
      </article>
    </div>
  );
}

export type StatementView = {
  payout: { reference: string | null; status: string; amountPaise: number; utr: string | null; mode: string; paidAt: string | null; createdAt: string; periodStart: string | null; periodEnd: string | null };
  seller: { legalName: string; storeName: string; gstin: string | null; pan: string | null };
  company: { legalName: string; gstin: string | null; address: string };
  lines: Array<{ orderNumber: string; deliveredAt: string | null; title: string; quantity: number; grossPaise: number; sellerDiscountPaise: number; commissionRateBps: number; commissionPaise: number; gstOnCommissionPaise: number; shippingFeePaise: number; cashbackPaise?: number; tcsPaise: number; tdsPaise: number; netPaise: number }>;
  charges: Array<{ description: string; amountPaise: number }>;
  feeInvoice: { id: string; number: string; totalPaise: number } | null;
  totals: { grossPaise: number; sellerDiscountPaise: number; commissionPaise: number; gstOnCommissionPaise: number; shippingFeePaise: number; cashbackPaise?: number; tcsPaise: number; tdsPaise: number; chargesPaise: number; adsPaise?: number; recoveriesPaise?: number; returnShippingPaise?: number; netPaise: number };
};

/** A seller's settlement statement: what was sold in the cycle, every deduction and what was paid. */
export function SettlementStatementDocument({ statement: s, feeInvoiceHref }: { statement: StatementView; feeInvoiceHref?: string }) {
  const t = s.totals;
  const rows: Array<[string, number, string?]> = [
    ["Sales (items delivered and kept)", t.grossPaise],
    ["Coupons you funded", -t.sellerDiscountPaise],
    ["Cashback to shoppers (your share)", -(t.cashbackPaise ?? 0), "given only on orders kept with no return"],
    ["Commission", -t.commissionPaise, "LOIMART fee invoice"],
    ["GST on commission (18%)", -t.gstOnCommissionPaise, "claim as input tax credit"],
    ["LOIMART courier (not covered by your wallet)", -t.shippingFeePaise],
    ["Advertising", -(t.adsPaise ?? t.chargesPaise)],
    ["Return pickups (all if damaged/wrong item, else 60%)", -(t.returnShippingPaise ?? 0), "LOIMART fee invoice"],
    ["Returned after an earlier payment (see orders below)", -(t.recoveriesPaise ?? 0), "commission given back on a fee credit note"],
    ["TCS deducted (GST, 0.5%)", -t.tcsPaise, "claim in your GST return"],
    ["TDS deducted (Income tax 194-O, 0.1%)", -t.tdsPaise, "claim in your ITR"],
  ];
  const period = s.payout.periodStart ? `${day(s.payout.periodStart)} – ${lastDay(s.payout.periodEnd)}` : day(s.payout.createdAt);
  return (
    <Shell title="Settlement statement" subtitle={`Settlement ${s.payout.reference ?? ""}`} isTest={s.payout.mode === "TEST"}>
      <section className="grid gap-4 border-b border-slate-200 py-4 sm:grid-cols-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Seller</p>
          <p className="mt-1 font-bold">{s.seller.legalName}</p>
          {s.seller.storeName !== s.seller.legalName ? <p>Store: {s.seller.storeName}</p> : null}
          {s.seller.gstin ? <p>GSTIN: <span className="font-mono">{s.seller.gstin}</span></p> : null}
          {s.seller.pan ? <p>PAN: <span className="font-mono">{s.seller.pan}</span></p> : null}
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 self-start">
          <dt className="text-slate-500">Settlement</dt><dd className="font-mono font-bold">{s.payout.reference ?? "—"}</dd>
          <dt className="text-slate-500">Period</dt><dd>{period}</dd>
          <dt className="text-slate-500">Paid on</dt><dd>{s.payout.paidAt ? day(s.payout.paidAt) : s.payout.status === "PAID" ? "—" : "Not sent yet"}</dd>
          {s.payout.utr ? <><dt className="text-slate-500">Bank UTR</dt><dd className="font-mono">{s.payout.utr}</dd></> : null}
          {s.feeInvoice ? <><dt className="text-slate-500">Fee invoice</dt><dd className="font-mono">{feeInvoiceHref ? <a href={feeInvoiceHref} className="underline">{s.feeInvoice.number}</a> : s.feeInvoice.number}</dd></> : null}
        </dl>
      </section>

      <section className="grid gap-4 py-4 sm:grid-cols-[1fr_auto]">
        <table className="w-full border-collapse text-[12px]">
          <tbody>
            {rows.filter(([, v], i) => i === 0 || v !== 0).map(([label, v, note]) => (
              <tr key={label}><td className={cell}>{label}{note ? <span className="block text-[10px] text-slate-500">{note}</span> : null}</td><td className={cell + " w-36 text-right"}>{v < 0 ? "−" + rs(-v) : rs(v)}</td></tr>
            ))}
            <tr className="bg-slate-100 text-sm font-black"><td className={cell}>Paid to your bank</td><td className={cell + " text-right"}>{rs(t.netPaise)}</td></tr>
          </tbody>
        </table>
      </section>
      <p className="text-[11px]"><span className="text-slate-500">Amount in words:</span> <b>{rupeesInWords(t.netPaise)}</b></p>

      <h2 className="mt-5 text-[11px] font-bold uppercase tracking-wider text-slate-500">Orders in this settlement</h2>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-[10.5px]">
          <thead className="bg-slate-100 text-left"><tr><th className={cell}>Order</th><th className={cell}>Item</th><th className={cell + " text-right"}>Sale</th><th className={cell + " text-right"}>Coupon</th><th className={cell + " text-right"}>Cashback</th><th className={cell + " text-right"}>Commission + GST</th><th className={cell + " text-right"}>Courier</th><th className={cell + " text-right"}>TCS</th><th className={cell + " text-right"}>TDS</th><th className={cell + " text-right"}>Net</th></tr></thead>
          <tbody>
            {s.lines.map((l, i) => (
              <tr key={i} className="align-top">
                <td className={cell + " font-mono"}>{l.orderNumber}<span className="block font-sans text-slate-500">Delivered {day(l.deliveredAt)}</span></td>
                <td className={cell}>{l.title} × {l.quantity}</td>
                <td className={cell + " text-right"}>{rs(l.grossPaise)}</td>
                <td className={cell + " text-right"}>{l.sellerDiscountPaise ? "−" + rs(l.sellerDiscountPaise) : "—"}</td>
                <td className={cell + " text-right"}>{l.cashbackPaise ? "−" + rs(l.cashbackPaise) : "—"}</td>
                <td className={cell + " text-right"}>{l.commissionRateBps ? `−${rs(l.commissionPaise + l.gstOnCommissionPaise)}` : "Free"}</td>
                <td className={cell + " text-right"}>{l.shippingFeePaise ? "−" + rs(l.shippingFeePaise) : "—"}</td>
                <td className={cell + " text-right"}>{l.tcsPaise ? "−" + rs(l.tcsPaise) : "—"}</td>
                <td className={cell + " text-right"}>{l.tdsPaise ? "−" + rs(l.tdsPaise) : "—"}</td>
                <td className={cell + " text-right font-semibold"}>{rs(l.netPaise)}</td>
              </tr>
            ))}
            {s.charges.map((c, i) => <tr key={"c" + i}><td className={cell} colSpan={9}>{c.description}</td><td className={cell + " text-right"}>−{rs(c.amountPaise)}</td></tr>)}
          </tbody>
        </table>
      </div>
      <footer className="mt-6 border-t border-slate-200 pt-4 text-[10px] text-slate-500">
        Issued by {s.company.legalName}{s.company.gstin ? ` (GSTIN ${s.company.gstin})` : ""}{s.company.address ? `, ${s.company.address}` : ""}. This statement is not a tax invoice; LOIMART&apos;s fees are billed on the fee invoice above. TCS and TDS are deposited with the government in your name. Computer-generated.
      </footer>
    </Shell>
  );
}

export type FeeInvoiceView = {
  kind?: "INVOICE" | "CREDIT_NOTE";
  number: string; issuedAt: string; isTest: boolean;
  details: {
    company: { legalName: string; tradeName: string; gstin: string | null; pan: string | null; address: string; state: string; stateCode: string | null };
    seller: { legalName: string; storeName: string; gstin: string | null; address: string; state: string; stateCode: string | null };
    periodStart: string | null; periodEnd: string | null; payoutReference: string | null; interState: boolean;
    lines: Array<{ description: string; sac: string; taxablePaise: number; rateBps: number; cgstPaise: number; sgstPaise: number; igstPaise: number; totalPaise: number }>;
    original?: { number: string; issuedAt: string }; reason?: string;
  };
};

/** LOIMART's tax invoice to a seller for its services (commission, courier, ads) in one settlement. */
export function FeeInvoiceDocument({ invoice }: { invoice: FeeInvoiceView }) {
  const d = invoice.details;
  const sum = (k: "taxablePaise" | "cgstPaise" | "sgstPaise" | "igstPaise" | "totalPaise") => d.lines.reduce((n, l) => n + l[k], 0);
  return (
    <Shell title={invoice.kind === "CREDIT_NOTE" ? "Credit note" : "Tax invoice"} subtitle={`LOIMART fee ${invoice.kind === "CREDIT_NOTE" ? "credit note" : "invoice"} ${invoice.number}`} isTest={invoice.isTest}>
      {invoice.isTest ? <p className="mt-2 text-[11px] font-bold text-red-600">TEST document, not a valid tax invoice.</p> : null}
      <section className="grid gap-4 border-b border-slate-200 py-4 sm:grid-cols-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">From (supplier)</p>
          <p className="mt-1 font-bold">{d.company.legalName}</p>
          {d.company.address ? <p>{d.company.address}</p> : null}
          <p>GSTIN: <span className="font-mono font-semibold">{d.company.gstin ?? "—"}</span></p>
          {d.company.pan ? <p>PAN: <span className="font-mono">{d.company.pan}</span></p> : null}
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">To (seller)</p>
          <p className="mt-1 font-bold">{d.seller.legalName}</p>
          <p>{d.seller.address}</p>
          <p>GSTIN: <span className="font-mono font-semibold">{d.seller.gstin ?? "Unregistered"}</span></p>
          <p className="mt-1">Place of supply: <b>{d.seller.state}{d.seller.stateCode ? ` (${d.seller.stateCode})` : ""}</b></p>
        </div>
      </section>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 py-3">
        <dt className="text-slate-500">{invoice.kind === "CREDIT_NOTE" ? "Credit note no." : "Invoice no."}</dt><dd className="font-mono font-bold">{invoice.number}</dd>
        {d.original ? <><dt className="text-slate-500">Against invoice</dt><dd className="font-mono">{d.original.number} ({day(d.original.issuedAt)})</dd></> : null}
        {d.reason ? <><dt className="text-slate-500">Reason</dt><dd>{d.reason}</dd></> : null}
        <dt className="text-slate-500">Date</dt><dd>{day(invoice.issuedAt)}</dd>
        {d.periodStart ? <><dt className="text-slate-500">Service period</dt><dd>{day(d.periodStart)} – {lastDay(d.periodEnd)}</dd></> : null}
        {d.payoutReference ? <><dt className="text-slate-500">Settlement</dt><dd className="font-mono">{d.payoutReference}</dd></> : null}
      </dl>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] border-collapse text-[11px]">
          <thead className="bg-slate-100 text-left"><tr><th className={cell}>#</th><th className={cell}>Service</th><th className={cell}>SAC</th><th className={cell + " text-right"}>Taxable value</th>{d.interState ? <th className={cell + " text-right"}>IGST 18%</th> : <><th className={cell + " text-right"}>CGST 9%</th><th className={cell + " text-right"}>SGST 9%</th></>}<th className={cell + " text-right"}>Total</th></tr></thead>
          <tbody>
            {d.lines.map((l, i) => (
              <tr key={i}><td className={cell}>{i + 1}</td><td className={cell}>{l.description}</td><td className={cell + " font-mono"}>{l.sac}</td><td className={cell + " text-right"}>{rs(l.taxablePaise)}</td>{d.interState ? <td className={cell + " text-right"}>{rs(l.igstPaise)}</td> : <><td className={cell + " text-right"}>{rs(l.cgstPaise)}</td><td className={cell + " text-right"}>{rs(l.sgstPaise)}</td></>}<td className={cell + " text-right font-semibold"}>{rs(l.totalPaise)}</td></tr>
            ))}
            <tr className="bg-slate-50 font-bold"><td className={cell} colSpan={3}>Total</td><td className={cell + " text-right"}>{rs(sum("taxablePaise"))}</td>{d.interState ? <td className={cell + " text-right"}>{rs(sum("igstPaise"))}</td> : <><td className={cell + " text-right"}>{rs(sum("cgstPaise"))}</td><td className={cell + " text-right"}>{rs(sum("sgstPaise"))}</td></>}<td className={cell + " text-right"}>{rs(sum("totalPaise"))}</td></tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3"><span className="text-slate-500">Amount in words:</span> <b>{rupeesInWords(sum("totalPaise"))}</b></p>
      <p className="mt-1 text-slate-500">{invoice.kind === "CREDIT_NOTE" ? "This commission and its GST are given back to you (netted in the amount recovered for the returned goods). Reduce your input tax credit by this GST." : <>Already deducted from your settlement{d.payoutReference ? ` ${d.payoutReference}` : ""} (courier fees partly from your courier wallet). Tax payable on reverse charge: No. GST-registered sellers can claim this GST as input tax credit.</>}</p>
      <footer className="mt-6 grid gap-4 border-t border-slate-200 pt-4 text-[10px] text-slate-500 sm:grid-cols-[1fr_auto]">
        <p>Computer-generated invoice; no signature required.</p>
        <p className="text-right font-semibold text-slate-700">For {d.company.legalName}<span className="mt-6 block font-normal text-slate-500">Authorised signatory</span></p>
      </footer>
    </Shell>
  );
}
