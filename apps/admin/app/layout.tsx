import type { Metadata } from "next";
import Link from "next/link";
import "@azadimart/ui/globals.css";

export const metadata: Metadata = {
  title: "AzadiMart Admin",
  description: "Operations and commerce console",
};

const NAV = [
  ["/dashboard","Dashboard"],["/orders","Orders"],["/products","Products"],["/sellers","Sellers"],["/customers","Customers"],
  ["/qc","QC"],["/logistics","Logistics"],["/payments","Payments"],["/finance","Finance"],["/returns","Returns"],
  ["/support","Support"],["/marketing","Marketing"],["/security","Security & Audit"],["/online-store","Online Store"],
] as const;

export default function RootLayout({children}:{children:React.ReactNode}){
 return <html lang="en"><body className="min-h-screen bg-slate-50 antialiased">
  <div className="min-h-screen md:flex">
   <aside className="hidden w-60 shrink-0 border-r bg-white p-4 md:block">
    <div className="sticky top-4"><p className="text-xs uppercase tracking-wide text-slate-500">admin.azadimart.com</p><p className="mt-1 text-lg font-black">Azadi<span className="text-amber-500">Mart</span></p><nav className="mt-7 flex max-h-[calc(100vh-120px)] flex-col gap-1 overflow-y-auto">{NAV.map(([href,label])=><Link key={href} href={href} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-950">{label}</Link>)}</nav></div>
   </aside>
   <div className="min-w-0 flex-1">
    <div className="sticky top-0 z-20 border-b bg-white/95 px-4 py-3 backdrop-blur md:hidden"><div className="flex items-center justify-between"><p className="font-black">Azadi<span className="text-amber-500">Mart</span></p><span className="text-xs text-slate-500">Admin</span></div><nav className="mt-3 flex gap-2 overflow-x-auto pb-1">{NAV.map(([href,label])=><Link key={href} href={href} className="shrink-0 rounded-full border bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">{label}</Link>)}</nav></div>
    {children}
   </div>
  </div>
 </body></html>
}