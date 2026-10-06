import type { Metadata } from "next";
import Link from "next/link";
import "@azadimart/ui/globals.css";

export const metadata: Metadata = {
  title: "AzadiMart Admin",
  description: "Admin console",
};

const NAV = [
  ["/dashboard", "Dashboard"],
  ["/orders", "Orders"],
  ["/products", "Products"],
  ["/sellers", "Sellers"],
  ["/customers", "Customers"],
  ["/qc", "QC"],
  ["/logistics", "Logistics"],
  ["/payments", "Payments"],
  ["/finance", "Finance"],
  ["/returns", "Returns"],
  ["/support", "Support"],
  ["/marketing", "Marketing"],
  ["/security", "Security & Audit"],
  ["/online-store", "Online Store"],
] as const;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <div className="flex min-h-screen">
          <aside className="w-56 border-r border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-ink-muted">admin.azadimart.com</p>
            <p className="mt-1 font-semibold">AzadiMart</p>
            <nav className="mt-6 flex flex-col gap-2 text-sm">
              {NAV.map(([href, label]) => (
                <Link key={href} href={href} className="text-ink hover:text-saffron">
                  {label}
                </Link>
              ))}
            </nav>
          </aside>
          <div className="flex-1">{children}</div>
        </div>
      </body>
    </html>
  );
}
