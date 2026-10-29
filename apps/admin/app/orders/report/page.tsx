import Link from "next/link";
import { salesReport } from "@azadimart/database";
import { istDay, SALES_REPORT_PERIODS } from "@azadimart/shared";
import { PortalPageHeader, StatCard } from "@azadimart/ui";
import { requireStaffPage } from "../../lib/staff-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sales report" };

const money = (paise: number) => "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const pct = (part: number, whole: number) => (whole ? `${((part / whole) * 100).toFixed(part / whole < 0.1 ? 1 : 0)}%` : "0%");
const dayLabel = (day: string, opts: Intl.DateTimeFormatOptions) => new Date(day + "T00:00:00Z").toLocaleDateString("en-IN", { timeZone: "UTC", ...opts });

/** Orders day by day and by delivery state: what's selling where, and where it isn't. */
export default async function SalesReportPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { db } = await requireStaffPage("orders");
  const asked = Number((await searchParams).days);
  const days = (SALES_REPORT_PERIODS as readonly number[]).includes(asked) ? asked : 30;
  const now = new Date();
  const r = await salesReport(db, days, now);
  const today = r.days[r.days.length - 1]!;
  const yesterday = r.days[r.days.length - 2] ?? { orders: 0, salesPaise: 0, cancelled: 0, returned: 0 };
  const kept = r.totals.orders - r.totals.cancelled - r.totals.returned;
  const maxDay = Math.max(1, ...r.days.map((d) => d.orders));
  const maxState = Math.max(1, ...r.states.map((s) => s.orders));
  const best = r.states[0];
  const known = r.states.filter((s) => s.state !== "Not a known state");
  const lowest = known.length > 1 ? known[known.length - 1] : undefined;
  const vsYesterday = today.orders - yesterday.orders;

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader
        eyebrow="Sales"
        title="Sales report"
        description="Orders placed each day and where they're going, by delivery state. Days are India time. Orders count once paid (or confirmed for Cash on Delivery); sales leave out cancelled and returned orders."
        actions={<a href={`/api/v1/orders/report?days=${days}&format=csv`} className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:border-slate-900">Download CSV</a>}
      />

      <nav className="mt-5 flex gap-2" aria-label="Period">
        {SALES_REPORT_PERIODS.map((p) => (
          <Link key={p} href={`/orders/report?days=${p}`} className={"rounded-full px-4 py-1.5 text-sm font-semibold " + (p === days ? "bg-chrome text-white" : "bg-white ring-1 ring-slate-300 hover:ring-slate-900")}>Last {p} days</Link>
        ))}
      </nav>

      <section className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label={`Today · ${dayLabel(istDay(now), { day: "numeric", month: "short" })}`} value={`${today.orders} order${today.orders === 1 ? "" : "s"}`} hint={`${money(today.salesPaise)} · ${vsYesterday === 0 ? "same as" : vsYesterday > 0 ? `${vsYesterday} more than` : `${-vsYesterday} fewer than`} yesterday`} icon="orders" tone="brand" />
        <StatCard label="Yesterday" value={`${yesterday.orders} order${yesterday.orders === 1 ? "" : "s"}`} hint={money(yesterday.salesPaise)} icon="orders" />
        <StatCard label={`Last ${days} days`} value={`${r.totals.orders.toLocaleString("en-IN")} orders`} hint={`${money(r.totals.salesPaise)} · ${(r.totals.orders / days).toFixed(1)} a day`} icon="finance" tone="good" />
        <StatCard label="Average order" value={kept ? money(r.totals.salesPaise / kept) : "—"} hint={`${pct(r.totals.cancelled, r.totals.orders)} cancelled · ${pct(r.totals.returned, r.totals.orders)} returned`} icon="finance" />
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
        <h2 className="font-semibold">Orders by day</h2>
        <div className="mt-4 flex h-44 items-end gap-[3px]" role="img" aria-label={`Orders per day over the last ${days} days`}>
          {r.days.map((d) => (
            <div key={d.day} className="group relative flex h-full flex-1 flex-col justify-end" title={`${dayLabel(d.day, { weekday: "short", day: "numeric", month: "short" })}: ${d.orders} orders · ${money(d.salesPaise)}`}>
              <div className={"w-full rounded-t-sm " + (d.day === today.day ? "bg-brand" : "bg-slate-800 group-hover:bg-brand")} style={{ height: `${d.orders ? Math.max(3, (d.orders / maxDay) * 100) : 0}%` }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-slate-400"><span>{dayLabel(r.days[0]!.day, { day: "numeric", month: "short" })}</span><span>Today</span></div>
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold text-brand-600">Show every day</summary>
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[520px] text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-[0.08em] text-slate-400"><th className="py-2 pr-3 font-medium">Day</th><th className="px-3 text-right font-medium">Orders</th><th className="px-3 text-right font-medium">Cancelled</th><th className="px-3 text-right font-medium">Returned</th><th className="pl-3 text-right font-medium">Sales</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{[...r.days].reverse().map((d) => (
              <tr key={d.day}><td className="py-2 pr-3">{dayLabel(d.day, { weekday: "short", day: "numeric", month: "short" })}</td><td className="px-3 text-right font-semibold">{d.orders}</td><td className="px-3 text-right text-slate-500">{d.cancelled || "—"}</td><td className="px-3 text-right text-slate-500">{d.returned || "—"}</td><td className="pl-3 text-right">{money(d.salesPaise)}</td></tr>
            ))}</tbody>
          </table></div>
        </details>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200/80 bg-white shadow-card">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold">Orders by state</h2>
          {best ? <p className="mt-1 text-sm text-slate-500">Most orders: <b className="text-slate-800">{best.state}</b> ({best.orders}, {pct(best.orders, r.totals.orders)}){lowest && lowest.state !== best.state ? <> · fewest: <b className="text-slate-800">{lowest.state}</b> ({lowest.orders})</> : null}</p> : null}
        </div>
        {r.states.length === 0 ? <p className="px-5 py-10 text-center text-sm text-slate-500">No orders in the last {days} days.</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-[0.08em] text-slate-400"><th className="px-5 py-3 font-medium">#</th><th className="px-3 font-medium">State</th><th className="w-[30%] px-3 font-medium">Orders</th><th className="px-3 text-right font-medium">Sales</th><th className="px-3 text-right font-medium">Cancelled / returned</th><th className="px-5 font-medium">Top cities</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{r.states.map((s, i) => (
              <tr key={s.state}>
                <td className="px-5 py-3 text-slate-400">{i + 1}</td>
                <td className="px-3 font-medium">{s.state}</td>
                <td className="px-3"><div className="flex items-center gap-2"><div className="h-2 flex-1 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-brand" style={{ width: `${(s.orders / maxState) * 100}%` }} /></div><span className="w-24 shrink-0 text-right"><b>{s.orders}</b> <span className="text-xs text-slate-500">· {pct(s.orders, r.totals.orders)}</span></span></div></td>
                <td className="px-3 text-right">{money(s.salesPaise)}</td>
                <td className={"px-3 text-right " + ((s.cancelled + s.returned) / s.orders >= 0.25 ? "font-semibold text-red-700" : "text-slate-500")}>{s.cancelled + s.returned ? `${s.cancelled + s.returned} · ${pct(s.cancelled + s.returned, s.orders)}` : "—"}</td>
                <td className="px-5 text-xs text-slate-500">{s.topCities.join(", ") || "—"}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {r.noOrders.length ? <div className="border-t border-slate-100 px-5 py-4">
          <p className="text-sm font-semibold">No orders yet from {r.noOrders.length} state{r.noOrders.length === 1 ? "" : "s"} / UTs</p>
          <div className="mt-2 flex flex-wrap gap-1.5">{r.noOrders.map((s) => <span key={s} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{s}</span>)}</div>
        </div> : null}
      </section>
    </main>
  );
}
