import Link from "next/link";
import { LEGAL } from "../lib/legal";

export type LegalSection = { id: string; title: string; body: React.ReactNode };

/**
 * Layout for the Terms and Privacy pages: title band, "last updated", a
 * table of contents (sticky on desktop) and numbered sections. Prints cleanly.
 */
export default function LegalPage({ eyebrow, title, intro, sections, other }: { eyebrow: string; title: string; intro: React.ReactNode; sections: LegalSection[]; other: { href: string; label: string } }) {
  return (
    <main className="bg-canvas">
      <section className="relative overflow-hidden bg-[#140630] text-white print:bg-white print:text-black">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full bg-[#6A2CD6]/40 blur-3xl print:hidden" />
        <div className="relative mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#F9CB5B]">{eyebrow}</p>
          <h1 className="mt-3 text-[32px] font-bold tracking-[-0.03em] sm:text-[46px]">{title}</h1>
          <p className="mt-3 text-sm text-white/70 print:text-black">Last updated: {LEGAL.updatedOn}</p>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 sm:px-8 lg:grid-cols-[260px_1fr] lg:gap-12 lg:py-14">
        <nav aria-label="On this page" className="h-fit rounded-2xl border border-slate-200 bg-white p-5 lg:sticky lg:top-28 print:hidden">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">On this page</p>
          <ol className="mt-3 space-y-1.5 text-sm">
            {sections.map((s, i) => (
              <li key={s.id}><a href={"#" + s.id} className="flex gap-2 text-slate-600 hover:text-[#6A2CD6]"><span className="w-5 shrink-0 text-slate-400">{i + 1}.</span>{s.title}</a></li>
            ))}
          </ol>
          <div className="mt-5 border-t border-slate-100 pt-4 text-sm">
            <Link href={other.href} className="font-semibold text-[#6A2CD6] hover:underline">{other.label} →</Link>
          </div>
        </nav>

        <article className="min-w-0 rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-40px_rgba(42,14,95,0.35)] sm:p-10 print:border-0 print:shadow-none">
          <div className="text-[15.5px] leading-7 text-slate-700">{intro}</div>
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-28 border-t border-slate-100 pt-8 mt-8 first-of-type:mt-8">
              <h2 className="text-[20px] font-bold tracking-[-0.01em] text-[#2A0E5F] sm:text-[22px]"><span className="mr-2 text-[#6A2CD6]">{i + 1}.</span>{s.title}</h2>
              <div className="legal-body mt-3 space-y-3 text-[15px] leading-7 text-slate-700 [&_a]:font-semibold [&_a]:text-[#6A2CD6] [&_a]:underline [&_a]:underline-offset-2 [&_b]:text-slate-900 [&_li]:pl-1 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">{s.body}</div>
            </section>
          ))}
        </article>
      </div>
    </main>
  );
}

/** Company, customer care and Grievance Officer block (shown in both documents). */
export function ContactBlock() {
  const g = LEGAL.grievanceOfficer;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-2xl bg-slate-50 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Customer care</p>
        <p className="mt-1 font-semibold text-slate-900">{LEGAL.companyName}</p>
        {LEGAL.address ? <p className="text-sm">{LEGAL.address}</p> : null}
        {LEGAL.gstin ? <p className="text-sm">GSTIN: {LEGAL.gstin}</p> : null}
        {LEGAL.supportEmail ? <p className="text-sm">Email: <a href={"mailto:" + LEGAL.supportEmail}>{LEGAL.supportEmail}</a></p> : null}
        {LEGAL.supportPhone ? <p className="text-sm">Phone: <a href={"tel:" + LEGAL.supportPhone.replace(/\s/g, "")}>{LEGAL.supportPhone}</a></p> : null}
        <p className="text-sm">Live chat: tap <b>Help</b> on any page.</p>
      </div>
      <div className="rounded-2xl bg-slate-50 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Grievance Officer</p>
        <p className="mt-1 font-semibold text-slate-900">{g.name}</p>
        <p className="text-sm">{g.designation}, {LEGAL.brand}</p>
        {g.email ? <p className="text-sm">Email: <a href={"mailto:" + g.email}>{g.email}</a></p> : null}
        <p className="text-sm">We acknowledge complaints within 48 hours and resolve them within one month.</p>
      </div>
    </div>
  );
}
