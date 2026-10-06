import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-sm uppercase tracking-wide text-ink-muted">azadimart.com</p>
      <h1 className="mt-2 text-4xl font-semibold">AzadiMart</h1>
      <p className="mt-4 text-lg text-ink-muted">
        Storefront foundation. Catalog, cart, and checkout APIs will land on this app only.
      </p>
      <nav className="mt-8 flex gap-4 text-saffron">
        <Link href="/products">Products</Link>
        <Link href="/cart">Cart</Link>
        <Link href="/wishlist">Wishlist</Link>
      </nav>
    </main>
  );
}
