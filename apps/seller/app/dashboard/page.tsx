import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionPrincipal } from "@azadimart/auth";
import { createDatabase } from "@azadimart/database";

async function requireSellerSession() {
  const headerStore = await headers();
  const cookie = headerStore.get("cookie");
  const principal = await getSessionPrincipal(
    new Request("http://azadimart.internal", {
      headers: cookie ? { cookie } : undefined,
    }),
    createDatabase(),
  );

  if (!principal || principal.role !== "SELLER" || !principal.sellerId) {
    redirect("/login");
  }

  return principal;
}

export default async function DashboardPage() {
  const session = await requireSellerSession();

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-sm uppercase tracking-wide text-ink-muted">Seller portal</p>
      <h1 className="mt-2 text-3xl font-semibold">Seller dashboard</h1>
      <p className="mt-2 text-ink-muted">
        Authenticated seller session: {session.sellerId}
      </p>
    </main>
  );
}
