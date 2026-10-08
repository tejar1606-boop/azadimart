import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionPrincipal } from "@azadimart/auth";
import { createDatabase, mediaAssets, sellerDocuments, sellerVerifications, sellers } from "@azadimart/database";
import { PortalPageHeader } from "@azadimart/ui";
import { asc, desc, eq } from "drizzle-orm";
import KycForm, { type DocType, type KycStage } from "./kyc-form";

export const metadata = { title: "KYC & business" };

export default async function KycPage() {
  const headerStore = await headers();
  const cookie = headerStore.get("cookie");
  const db = createDatabase();
  const principal = await getSessionPrincipal(
    new Request("http://azadimart.internal", { headers: cookie ? { cookie } : undefined }),
    db,
  );
  if (!principal || principal.role !== "SELLER" || !principal.sellerId) redirect("/login");

  const [seller, verification, documents] = await Promise.all([
    db.select({ storeName: sellers.storeName, legalName: sellers.legalName, status: sellers.status, taxIdentityType: sellers.taxIdentityType, gstin: sellers.gstin, gstEnrolmentId: sellers.gstEnrolmentId, businessState: sellers.businessState })
      .from(sellers).where(eq(sellers.id, principal.sellerId)).limit(1).then((r) => r[0]),
    db.select({ status: sellerVerifications.status, notes: sellerVerifications.notes })
      .from(sellerVerifications).where(eq(sellerVerifications.sellerId, principal.sellerId)).orderBy(desc(sellerVerifications.updatedAt)).limit(1).then((r) => r[0]),
    db.select({ type: sellerDocuments.type, mediaAssetId: sellerDocuments.mediaAssetId, mimeType: mediaAssets.mimeType, createdAt: sellerDocuments.createdAt })
      .from(sellerDocuments).innerJoin(mediaAssets, eq(mediaAssets.id, sellerDocuments.mediaAssetId))
      .where(eq(sellerDocuments.sellerId, principal.sellerId)).orderBy(asc(sellerDocuments.createdAt)),
  ]);
  if (!seller) redirect("/login");

  // Where the seller is in verification decides whether documents can still change.
  const stage: KycStage =
    seller.status === "ACTIVE" ? "VERIFIED"
      : seller.status === "SUSPENDED" ? "SUSPENDED"
        : verification?.status === "IN_REVIEW" || seller.status === "KYC_SUBMITTED" || seller.status === "PENDING_APPROVAL" ? "IN_REVIEW"
          : verification?.status === "REJECTED" || seller.status === "REJECTED" ? "REJECTED"
            : "TODO";

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader eyebrow="Account" title="KYC & business verification" description={`${seller.storeName} · ${seller.legalName}`} />
      <KycForm
        stage={stage}
        reviewNotes={verification?.status === "REJECTED" ? verification.notes : null}
        taxIdentityType={seller.taxIdentityType}
        taxNumber={seller.taxIdentityType === "ENROLMENT_ID" ? seller.gstEnrolmentId : seller.gstin}
        businessState={seller.businessState}
        existing={documents.map((d) => ({ type: d.type as DocType, mediaAssetId: d.mediaAssetId, fileName: d.mimeType === "application/pdf" ? "PDF document" : "Image document", uploadedAt: d.createdAt.toISOString() }))}
      />
    </main>
  );
}
