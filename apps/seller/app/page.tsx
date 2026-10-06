import Link from "next/link";

const STEPS = [
  "Registration",
  "KYC / business verification",
  "Admin approval",
  "Dashboard",
  "Product creation",
  "Images (8) + video (1)",
  "A+ content",
  "Variants / inventory",
  "Submit for QC",
  "Admin approval",
  "Live on storefront",
];

export default function SellerHomePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-sm uppercase tracking-wide text-ink-muted">seller.azadimart.com</p>
      <h1 className="mt-2 text-4xl font-semibold">Seller portal</h1>
      <ol className="mt-8 list-decimal space-y-1 pl-5 text-ink-muted">
        {STEPS.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <nav className="mt-8 flex flex-wrap gap-4 text-saffron">
        <Link href="/register">Register</Link>
        <Link href="/kyc">KYC</Link>
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/products/new">New product</Link>
      </nav>
    </main>
  );
}
