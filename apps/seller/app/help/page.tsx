import Link from "next/link";
import { PortalPageHeader } from "@azadimart/ui";

export const metadata = { title: "Help & support" };

const TOPICS: Array<{ title: string; items: Array<[string, React.ReactNode]> }> = [
  { title: "Getting started", items: [
    ["How do I start selling?", <>Complete <Link href="/kyc" className="font-semibold text-brand-600">KYC</Link> (PAN, bank proof, address proof and GST or Enrolment ID). Once AzadiMart approves it, add products. Each product is quality-checked before it goes live.</>],
    ["I don't have GST. Can I sell?", "Yes. Register with a free GST Enrolment ID. You can sell to customers in your own state; add a GSTIN later to sell across India."],
  ] },
  { title: "Listing products", items: [
    ["What photos should I use?", "Square (1:1) photos, at least 1000 × 1000 px, on a clean background. Add up to 8 photos and one video. The first photo is the cover."],
    ["How do I add specifications?", <>When creating a product, choose <b>Specification table</b> and paste a table from a web page, Excel or Google Sheets, or add rows one by one.</>],
    ["Why was my product sent back?", <>The QC team leaves notes on what to fix. Open <Link href="/notices" className="font-semibold text-brand-600">Notices</Link> or <Link href="/products" className="font-semibold text-brand-600">Products</Link>, fix the listing and submit it again.</>],
    ["What is A+ content?", "Rich banners, images and comparison tables shown on your product page. Open a product in Products and choose A+ content; it goes live after approval."],
  ] },
  { title: "Orders & shipping", items: [
    ["How quickly must I ship?", "Pack and ship new orders as soon as possible, ideally within 1–2 days. Orders waiting to ship appear in Orders and Notices."],
    ["Where do I set my pickup address?", <>In <Link href="/shipping" className="font-semibold text-brand-600">Shipping &amp; pickup</Link>. Keep product package weights accurate so courier charges are correct.</>],
  ] },
  { title: "Payments & account", items: [
    ["When do I get paid?", <>Your sales and payouts are shown in <Link href="/payouts" className="font-semibold text-brand-600">Payments</Link>, paid to the bank account verified in KYC.</>],
    ["How do I change my bank account?", "Bank details are verified during KYC. To change them after approval, contact AzadiMart seller support."],
  ] },
];

export default function HelpPage() {
  const email = process.env.NEXT_PUBLIC_SELLER_SUPPORT_EMAIL;
  const phone = process.env.NEXT_PUBLIC_SELLER_SUPPORT_PHONE;
  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader eyebrow="Seller Hub" title="Help & support" description="Quick answers to common questions. Tap a question to open it." />
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          {TOPICS.map((topic) => (
            <section key={topic.title} className="rounded-2xl border border-slate-200/80 bg-white shadow-card">
              <h2 className="border-b border-slate-100 px-5 py-3.5 font-semibold">{topic.title}</h2>
              <div className="divide-y divide-slate-100">
                {topic.items.map(([q, a]) => (
                  <details key={q} className="group px-5 py-3.5">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium">{q}<span className="text-slate-400 transition group-open:rotate-45" aria-hidden="true">+</span></summary>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{a}</p>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>
        <aside className="h-fit rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
          <p className="font-semibold">Still need help?</p>
          {email || phone ? (
            <div className="mt-3 space-y-2 text-sm">
              {email ? <a href={`mailto:${email}`} className="block rounded-xl bg-slate-50 px-4 py-3 font-medium hover:bg-slate-100">✉️ {email}</a> : null}
              {phone ? <a href={`https://wa.me/91${phone.replace(/\D/g, "").slice(-10)}`} target="_blank" rel="noreferrer" className="block rounded-xl bg-[#25d366]/10 px-4 py-3 font-medium text-[#128c4b] hover:bg-[#25d366]/20">WhatsApp {phone}</a> : null}
            </div>
          ) : <p className="mt-2 text-sm text-slate-500">Seller support contact details will appear here.</p>}
        </aside>
      </div>
    </main>
  );
}
