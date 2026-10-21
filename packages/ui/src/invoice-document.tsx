"use client";

import { formatGstRate, rupeesInWords } from "@azadimart/shared";
import { BrandWordmark } from "./brand";

type Line = { title: string; sku: string; hsnCode: string | null; gstRateBps: number; quantity: number; unitPricePaise: number; grossPaise: number; discountPaise: number; netPaise: number; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number };
export type InvoiceView = {
  kind: "TAX_INVOICE" | "BILL_OF_SUPPLY" | "CREDIT_NOTE";
  number: string;
  issuedAt: string;
  isTest: boolean;
  details: {
    seller: { legalName: string; storeName: string; gstin: string | null; gstEnrolmentId: string | null; pan: string | null; address: string; state: string; stateCode: string | null };
    buyer: { name: string; phone: string | null; address: string; state: string; stateCode: string | null };
    marketplace: { name: string; legalName: string; gstin: string | null; address: string };
    orderNumber: string; orderDate: string; placeOfSupply: string; interState: boolean; paymentMethod: string;
    lines: Line[]; platformDiscountPaise: number;
    original?: { number: string; issuedAt: string }; reason?: string;
  };
};

const TITLE = { TAX_INVOICE: "Tax Invoice", BILL_OF_SUPPLY: "Bill of Supply", CREDIT_NOTE: "Credit Note" } as const;
const rs = (paise: number) => "₹" + (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

/**
 * A printable invoice, bill of supply or credit note (A4). The seller is the
 * supplier; LOIMART appears as the e-commerce operator. "Download PDF" opens
 * the browser's print dialog (Save as PDF); only the invoice is printed.
 */
export function InvoiceDocument({ invoice }: { invoice: InvoiceView }) {
  const d = invoice.details;
  const taxed = invoice.kind !== "BILL_OF_SUPPLY" && !(invoice.kind === "CREDIT_NOTE" && d.lines.every((l) => l.cgstPaise + l.sgstPaise + l.igstPaise === 0 && l.gstRateBps === 0));
  const sum = (k: keyof Pick<Line, "grossPaise" | "discountPaise" | "netPaise" | "taxablePaise" | "cgstPaise" | "sgstPaise" | "igstPaise">) => d.lines.reduce((n, l) => n + l[k], 0);
  const total = sum("netPaise");
  const paid = Math.max(0, total - d.platformDiscountPaise);
  const cell = "border border-slate-300 px-2 py-1.5";
  // Tax summary by HSN and rate (GST invoices list tax per rate).
  const byRate = new Map<string, { hsn: string; rate: number; taxable: number; cgst: number; sgst: number; igst: number }>();
  for (const l of d.lines) {
    const key = `${l.hsnCode ?? "—"}:${l.gstRateBps}`;
    const row = byRate.get(key) ?? { hsn: l.hsnCode ?? "—", rate: l.gstRateBps, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    row.taxable += l.taxablePaise; row.cgst += l.cgstPaise; row.sgst += l.sgstPaise; row.igst += l.igstPaise;
    byRate.set(key, row);
  }

  return (
    <div className="invoice-wrap">
      <style>{`@media print { @page { size: A4; margin: 12mm; } body * { visibility: hidden !important; } .invoice-doc, .invoice-doc * { visibility: visible !important; } .invoice-doc { position: absolute; inset: 0 auto auto 0; width: 100%; box-shadow: none !important; border: 0 !important; } .invoice-noprint { display: none !important; } }`}</style>
      <div className="invoice-noprint mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">{TITLE[invoice.kind]} {invoice.number}</p>
        <button type="button" onClick={() => window.print()} className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">Download PDF</button>
      </div>
      <article className="invoice-doc relative mx-auto max-w-[210mm] overflow-hidden border border-slate-300 bg-white p-6 text-[12px] leading-snug text-slate-900 shadow-sm sm:p-8">
        {invoice.isTest ? <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center"><span className="-rotate-[24deg] text-[84px] font-black tracking-widest text-red-500/15">TEST</span></div> : null}
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-slate-900 pb-4">
          <div>
            <h1 className="text-xl font-black uppercase tracking-wide">{TITLE[invoice.kind]}</h1>
            {invoice.kind === "BILL_OF_SUPPLY" ? <p className="mt-0.5 text-[11px] text-slate-600">Supplier not registered for GST (Enrolment ID). No GST charged.</p> : null}
            {invoice.isTest ? <p className="mt-1 text-[11px] font-bold text-red-600">TEST document, not a valid tax invoice.</p> : null}
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
              <dt className="text-slate-500">{invoice.kind === "CREDIT_NOTE" ? "Credit note no." : "Invoice no."}</dt><dd className="font-mono font-bold">{invoice.number}</dd>
              <dt className="text-slate-500">Date</dt><dd>{day(invoice.issuedAt)}</dd>
              {d.original ? <><dt className="text-slate-500">Against invoice</dt><dd className="font-mono">{d.original.number} ({day(d.original.issuedAt)})</dd></> : null}
              {d.reason ? <><dt className="text-slate-500">Reason</dt><dd>{d.reason}</dd></> : null}
              <dt className="text-slate-500">Order</dt><dd className="font-mono">{d.orderNumber} ({day(d.orderDate)})</dd>
            </dl>
          </div>
          <div className="text-right"><BrandWordmark className="text-3xl" /><p className="mt-1 text-[11px] text-slate-500">Sold through LOIMART</p></div>
        </header>

        <section className="grid gap-4 border-b border-slate-200 py-4 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Sold by</p>
            <p className="mt-1 font-bold">{d.seller.legalName}</p>
            {d.seller.storeName !== d.seller.legalName ? <p>Trading as {d.seller.storeName}</p> : null}
            <p>{d.seller.address}</p>
            {d.seller.gstin ? <p>GSTIN: <span className="font-mono font-semibold">{d.seller.gstin}</span></p> : null}
            {!d.seller.gstin && d.seller.gstEnrolmentId ? <p>GST Enrolment ID: <span className="font-mono">{d.seller.gstEnrolmentId}</span></p> : null}
            {d.seller.pan ? <p>PAN: <span className="font-mono">{d.seller.pan}</span></p> : null}
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Bill to / Ship to</p>
            <p className="mt-1 font-bold">{d.buyer.name}</p>
            <p>{d.buyer.address}</p>
            {d.buyer.phone ? <p>Phone: {d.buyer.phone}</p> : null}
            <p className="mt-1">Place of supply: <b>{d.placeOfSupply}</b></p>
          </div>
        </section>

        <div className="overflow-x-auto py-4">
          <table className="w-full min-w-[640px] border-collapse text-[11px]">
            <thead className="bg-slate-100 text-left">
              <tr>
                <th className={cell}>#</th><th className={cell}>Item</th><th className={cell}>HSN</th><th className={cell + " text-right"}>Qty</th>
                <th className={cell + " text-right"}>Price</th><th className={cell + " text-right"}>Discount</th>
                {taxed ? <><th className={cell + " text-right"}>Taxable value</th>{d.interState ? <th className={cell + " text-right"}>IGST</th> : <><th className={cell + " text-right"}>CGST</th><th className={cell + " text-right"}>SGST</th></>}</> : null}
                <th className={cell + " text-right"}>Total</th>
              </tr>
            </thead>
            <tbody>
              {d.lines.map((l, i) => (
                <tr key={i} className="align-top">
                  <td className={cell}>{i + 1}</td>
                  <td className={cell}><span className="font-semibold">{l.title}</span><span className="block text-slate-500">SKU {l.sku}</span></td>
                  <td className={cell + " font-mono"}>{l.hsnCode ?? "—"}</td>
                  <td className={cell + " text-right"}>{l.quantity}</td>
                  <td className={cell + " text-right"}>{rs(l.unitPricePaise)}</td>
                  <td className={cell + " text-right"}>{l.discountPaise ? "−" + rs(l.discountPaise) : "—"}</td>
                  {taxed ? <><td className={cell + " text-right"}>{rs(l.taxablePaise)}</td>
                    {d.interState ? <td className={cell + " text-right"}>{rs(l.igstPaise)}<span className="block text-slate-500">@{formatGstRate(l.gstRateBps)}</span></td>
                      : <><td className={cell + " text-right"}>{rs(l.cgstPaise)}<span className="block text-slate-500">@{formatGstRate(l.gstRateBps / 2)}</span></td><td className={cell + " text-right"}>{rs(l.sgstPaise)}<span className="block text-slate-500">@{formatGstRate(l.gstRateBps / 2)}</span></td></>}</> : null}
                  <td className={cell + " text-right font-semibold"}>{rs(l.netPaise)}</td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-bold">
                <td className={cell} colSpan={5}>Total</td>
                <td className={cell + " text-right"}>{sum("discountPaise") ? "−" + rs(sum("discountPaise")) : "—"}</td>
                {taxed ? <><td className={cell + " text-right"}>{rs(sum("taxablePaise"))}</td>{d.interState ? <td className={cell + " text-right"}>{rs(sum("igstPaise"))}</td> : <><td className={cell + " text-right"}>{rs(sum("cgstPaise"))}</td><td className={cell + " text-right"}>{rs(sum("sgstPaise"))}</td></>}</> : null}
                <td className={cell + " text-right"}>{rs(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <section className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div>
            {taxed ? (
              <table className="border-collapse text-[11px]">
                <thead className="bg-slate-100 text-left"><tr><th className={cell}>HSN</th><th className={cell}>Rate</th><th className={cell + " text-right"}>Taxable</th>{d.interState ? <th className={cell + " text-right"}>IGST</th> : <><th className={cell + " text-right"}>CGST</th><th className={cell + " text-right"}>SGST</th></>}</tr></thead>
                <tbody>{[...byRate.values()].map((r) => <tr key={r.hsn + r.rate}><td className={cell + " font-mono"}>{r.hsn}</td><td className={cell}>{formatGstRate(r.rate)}</td><td className={cell + " text-right"}>{rs(r.taxable)}</td>{d.interState ? <td className={cell + " text-right"}>{rs(r.igst)}</td> : <><td className={cell + " text-right"}>{rs(r.cgst)}</td><td className={cell + " text-right"}>{rs(r.sgst)}</td></>}</tr>)}</tbody>
              </table>
            ) : null}
            <p className="mt-3"><span className="text-slate-500">Amount in words:</span> <b>{rupeesInWords(total)}</b></p>
            {taxed ? <p className="mt-1 text-slate-500">Tax payable on reverse charge: No. Prices include GST.</p> : null}
          </div>
          <dl className="min-w-56 self-start border border-slate-300 p-3">
            <div className="flex justify-between gap-6"><dt>{invoice.kind === "CREDIT_NOTE" ? "Credit value" : "Invoice value"}</dt><dd className="font-bold">{rs(total)}</dd></div>
            {d.platformDiscountPaise ? <div className="mt-1 flex justify-between gap-6 text-slate-600"><dt>LOIMART coupon{invoice.kind === "CREDIT_NOTE" ? " (not refunded)" : " (paid by LOIMART)"}</dt><dd>−{rs(d.platformDiscountPaise)}</dd></div> : null}
            <div className="mt-2 flex justify-between gap-6 border-t border-slate-300 pt-2 text-sm font-black"><dt>{invoice.kind === "CREDIT_NOTE" ? "Refund value" : "Customer paid"}</dt><dd>{rs(paid)}</dd></div>
            <p className="mt-1 text-[10px] text-slate-500">Payment: {d.paymentMethod}</p>
          </dl>
        </section>

        <footer className="mt-6 grid gap-4 border-t border-slate-200 pt-4 text-[10px] text-slate-500 sm:grid-cols-[1fr_auto]">
          <p>
            E-commerce operator: <b className="text-slate-700">{d.marketplace.legalName}</b>{d.marketplace.gstin ? <> · GSTIN <span className="font-mono">{d.marketplace.gstin}</span></> : null}{d.marketplace.address ? <> · {d.marketplace.address}</> : null}.
            {" "}This {TITLE[invoice.kind].toLowerCase()} is issued by LOIMART on behalf of the seller named above, who supplies the goods. Computer-generated; no signature required.
          </p>
          <p className="text-right font-semibold text-slate-700">For {d.seller.legalName}<span className="mt-6 block font-normal text-slate-500">Authorised signatory</span></p>
        </footer>
      </article>
    </div>
  );
}
