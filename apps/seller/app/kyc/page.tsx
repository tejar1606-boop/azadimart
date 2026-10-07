import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionPrincipal } from "@azadimart/auth";
import { createDatabase, sellers } from "@azadimart/database";
import { eq } from "drizzle-orm";
import KycForm from "./kyc-form";

export default async function KycPage() {
  const headerStore = await headers();
  const cookie = headerStore.get("cookie");
  const principal = await getSessionPrincipal(
    new Request("http://azadimart.internal", { headers: cookie ? { cookie } : undefined }),
    createDatabase(),
  );

  if (!principal || principal.role !== "SELLER" || !principal.sellerId) {
    redirect("/login");
  }

  const db = createDatabase();
  const rows = await db
    .select({ storeName: sellers.storeName, status: sellers.status, taxIdentityType: sellers.taxIdentityType, gstin: sellers.gstin, gstEnrolmentId: sellers.gstEnrolmentId, businessState: sellers.businessState })
    .from(sellers)
    .where(eq(sellers.id, principal.sellerId))
    .limit(1);

  const seller = rows[0];
  if (!seller) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12">
      <div className="mx-auto max-w-3xl">
        <p className="text-sm uppercase tracking-wide text-ink-muted">Seller verification</p>
        <h1 className="mt-2 text-3xl font-semibold">KYC / business verification</h1>
        <p className="mt-2 text-sm text-ink-muted">
          {seller.storeName} · Status: {seller.status} · {seller.taxIdentityType === "ENROLMENT_ID" ? "Enrolment ID route" : "GSTIN route"}
        </p>
        <KycForm taxIdentityType={seller.taxIdentityType} gstin={seller.gstin} gstEnrolmentId={seller.gstEnrolmentId} businessState={seller.businessState} />
      </div>
    </main>
  );
}
