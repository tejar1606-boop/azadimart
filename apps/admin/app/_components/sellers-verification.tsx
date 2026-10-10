"use client";

import { useEffect, useMemo, useState } from "react";

type Seller = {
  id: string;
  storeName: string;
  legalName: string;
  email: string;
  phone: string | null;
  taxIdentityType: "GSTIN" | "ENROLMENT_ID";
  gstin: string | null;
  gstEnrolmentId: string | null;
  businessState: string | null;
  taxDeclarationAcceptedAt: string | null;
  status: string;
  verificationStatus: string | null;
  documentCount: number;
  approvedAt: string | null;
  createdAt: string;
  aadhaarStatus?: "OTP_SENT" | "VERIFIED" | null;
};

type Aadhaar = { status: "OTP_SENT" | "VERIFIED"; masked: string; nameOnAadhaar: string | null; yearOfBirth: string | null; state: string | null; verifiedAt: string | null; consentAt: string; testMode: boolean };

// Loose check: does any word of the Aadhaar name appear in the legal name? (Companies differ; that's fine.)
const words = (v: string) => v.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length > 2);
const nameMatches = (aadhaarName: string, legalName: string) => words(aadhaarName).some((w) => words(legalName).includes(w));

type Detail = {
  seller: Seller & { pan: string | null; payoutHoldReason?: string | null; adCreditLimitPaise?: number | null };
  adBudget?: { creditLimitPaise: number; earningsPaise: number; usedPaise: number; availablePaise: number };
  bankAccount: { accountHolderName: string; last4: string; ifsc: string; status: "PENDING" | "VERIFIED" | "REJECTED"; rejectionReason: string | null; addedAt: string } | null;
  verification: {
    status: string;
    notes: string | null;
    reviewedAt: string | null;
  } | null;
  aadhaar: Aadhaar | null;
  documents: Array<{
    id: string;
    type: string;
    mimeType: string;
    byteSize: number;
    fileName: string;
  }>;
};

export default function SellersPage() {
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadSellers() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/v1/sellers?page=1&pageSize=50", {
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body?.error?.message ?? "Unable to load sellers.");
        return;
      }
      setSellers(body.sellers ?? []);
    } catch {
      setError("Unable to load sellers.");
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(sellerId: string) {
    setSelectedId(sellerId);
    setDetailLoading(true);
    setError("");
    setMessage("");
    setNotes("");
    try {
      const response = await fetch(`/api/v1/sellers/${sellerId}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) {
        setError(body?.error?.message ?? "Unable to load seller verification.");
        return;
      }
      setDetail(body);
    } catch {
      setError("Unable to load seller verification.");
    } finally {
      setDetailLoading(false);
    }
  }

  /** Bank account verification and payout hold: small actions that reload the panel afterwards. */
  async function sellerAction(path: string, body: object) {
    if (!selectedId) return;
    setActionLoading(true); setError("");
    try {
      const response = await fetch(`/api/v1/sellers/${selectedId}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await response.json().catch(() => null);
      if (!response.ok) throw new Error(json?.error?.message ?? "Action failed.");
      await loadDetail(selectedId);
    } catch (err) { setError(err instanceof Error ? err.message : "Action failed."); } finally { setActionLoading(false); }
  }
  function setAdCredit() {
    const current = detail?.seller.adCreditLimitPaise;
    const value = window.prompt("Ad credit for this seller in ₹ (leave empty for AzadiMart's default of ₹5,000). Ads they can book = upcoming earnings + this credit.", current != null ? String(current / 100) : "");
    if (value === null) return;
    const rupees = value.trim() === "" ? null : Number(value.replace(/[^\d]/g, ""));
    if (rupees !== null && !Number.isFinite(rupees)) return;
    if (!selectedId) return;
    setActionLoading(true); setError("");
    fetch(`/api/v1/sellers/${selectedId}/ad-credit`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limitPaise: rupees === null ? null : rupees * 100 }) })
      .then(async (response) => { if (!response.ok) throw new Error((await response.json().catch(() => null))?.error?.message ?? "Couldn't save"); await loadDetail(selectedId); })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't save"))
      .finally(() => setActionLoading(false));
  }
  function rejectBank() {
    const reason = window.prompt("Why is this bank account rejected? The seller will see this.", "Name doesn't match the bank proof");
    if (reason && reason.trim().length >= 3) void sellerAction("bank-account", { decision: "REJECTED", reason });
  }
  function toggleHold(hold: boolean) {
    if (!hold) { void sellerAction("payout-hold", { hold: false }); return; }
    const reason = window.prompt("Why are this seller's payouts on hold? The seller will see this.", "Account under review");
    if (reason && reason.trim().length >= 3) void sellerAction("payout-hold", { hold: true, reason });
  }

  async function decide(decision: "APPROVED" | "REJECTED") {
    if (!selectedId) return;
    setActionLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/v1/sellers/approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerId: selectedId,
          decision,
          notes: notes.trim() || undefined,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body?.error?.message ?? "Seller approval action failed.");
        return;
      }

      setMessage(decision === "APPROVED" ? "Seller approved successfully." : "Seller rejected.");
      await loadSellers();
      await loadDetail(selectedId);
    } catch {
      setError("Seller approval action failed.");
    } finally {
      setActionLoading(false);
    }
  }

  useEffect(() => {
    void loadSellers();
  }, []);

  const pending = useMemo(
    () => sellers.filter((seller) => seller.verificationStatus === "IN_REVIEW"),
    [sellers],
  );

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm uppercase tracking-wide text-ink-muted">Marketplace operations</p>
          <h1 className="mt-1 text-3xl font-semibold">Seller verification</h1>
          <p className="mt-2 max-w-3xl text-sm text-ink-muted">
            Review registration and KYC submissions before activating a seller account.
          </p>
        </div>
        <div className="rounded-xl bg-slate-100 px-4 py-3 text-sm">
          <span className="font-semibold">{pending.length}</span> pending KYC review
        </div>
      </div>

      {error ? <p className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="mt-5 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">{message}</p> : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-4">
            <h2 className="font-semibold">Seller applications</h2>
          </div>
          {loading ? (
            <p className="px-4 py-8 text-sm text-ink-muted">Loading sellers…</p>
          ) : sellers.length === 0 ? (
            <p className="px-4 py-8 text-sm text-ink-muted">No seller applications yet.</p>
          ) : (
            <div className="divide-y divide-slate-200">
              {sellers.map((seller) => (
                <button
                  key={seller.id}
                  type="button"
                  onClick={() => void loadDetail(seller.id)}
                  className={`block w-full px-4 py-4 text-left hover:bg-slate-50 ${selectedId === seller.id ? "bg-slate-50" : ""}`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-medium">{seller.storeName}</p>
                      <p className="text-sm text-ink-muted">{seller.legalName}</p>
                      <p className="mt-1 text-xs text-ink-muted">{seller.email}</p>
                    </div>
                    <span className="w-fit rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium">
                      {seller.verificationStatus ?? "PENDING"}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-ink-muted">
                    <span>Seller: {seller.status}</span><span>Tax: {seller.taxIdentityType === "ENROLMENT_ID" ? "Enrolment ID" : "GSTIN"}</span>
                    <span>Documents: {seller.documentCount}</span>
                    <span className={seller.aadhaarStatus === "VERIFIED" ? "font-semibold text-green-700" : "font-semibold text-amber-700"}>{seller.aadhaarStatus === "VERIFIED" ? "Aadhaar ✓" : "Aadhaar not verified"}</span>
                    <span>Created: {new Date(seller.createdAt).toLocaleDateString("en-IN")}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {!selectedId ? (
            <div className="flex min-h-64 items-center justify-center text-sm text-ink-muted">
              Select a seller to review the application.
            </div>
          ) : detailLoading ? (
            <p className="py-8 text-sm text-ink-muted">Loading verification details…</p>
          ) : detail ? (
            <div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-ink-muted">Application</p>
                  <h2 className="mt-1 text-xl font-semibold">{detail.seller.storeName}</h2>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium">
                  {detail.seller.status}
                </span>
              </div>

              <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
                <div><dt className="text-ink-muted">Legal name</dt><dd className="mt-1 font-medium">{detail.seller.legalName}</dd></div>
                <div className="min-w-0"><dt className="text-ink-muted">Email</dt><dd className="mt-1 break-all font-medium">{detail.seller.email}</dd></div>
                <div><dt className="text-ink-muted">Phone</dt><dd className="mt-1 font-medium">{detail.seller.phone ?? "—"}</dd></div>
                <div><dt className="text-ink-muted">Tax identity</dt><dd className="mt-1 font-medium">{detail.seller.taxIdentityType === "ENROLMENT_ID" ? "GST Enrolment ID" : "GSTIN"}</dd></div>
                <div><dt className="text-ink-muted">{detail.seller.taxIdentityType === "ENROLMENT_ID" ? "Enrolment ID" : "GSTIN"}</dt><dd className="mt-1 font-mono text-sm font-medium">{detail.seller.taxIdentityType === "ENROLMENT_ID" ? (detail.seller.gstEnrolmentId ?? "—") : (detail.seller.gstin ?? "—")}</dd></div>
                <div><dt className="text-ink-muted">Business state / UT</dt><dd className="mt-1 font-medium">{detail.seller.businessState ?? "—"}</dd></div>
                <div><dt className="text-ink-muted">PAN</dt><dd className="mt-1 font-medium">{detail.seller.pan ?? "—"}</dd></div>
                <div><dt className="text-ink-muted">Tax declaration</dt><dd className="mt-1 font-medium">{detail.seller.taxDeclarationAcceptedAt ? "Accepted" : "Missing"}</dd></div>
                <div><dt className="text-ink-muted">KYC status</dt><dd className="mt-1 font-medium">{detail.verification?.status ?? "—"}</dd></div>
              </dl>

              <div className={"mt-6 rounded-xl border p-4 " + (detail.aadhaar?.status === "VERIFIED" ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50")}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">{detail.aadhaar?.status === "VERIFIED" ? "Owner Aadhaar (OTP verified)" : "Owner Aadhaar"}</h3>
                  {detail.aadhaar?.testMode ? <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-bold text-purple-800">TEST MODE</span> : null}
                </div>
                {detail.aadhaar?.status === "VERIFIED" ? (
                  <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                    <div><dt className="text-ink-muted">Aadhaar</dt><dd className="mt-1 font-mono font-medium">{detail.aadhaar.masked}</dd></div>
                    <div><dt className="text-ink-muted">Name on Aadhaar</dt><dd className="mt-1 font-medium">{detail.aadhaar.nameOnAadhaar ?? "—"}{detail.aadhaar.nameOnAadhaar ? (nameMatches(detail.aadhaar.nameOnAadhaar, detail.seller.legalName) ? <span className="ml-2 text-xs font-semibold text-green-700">matches legal name</span> : <span className="ml-2 text-xs font-semibold text-amber-700">differs from legal name: check it&apos;s the owner or authorised signatory</span>) : null}</dd></div>
                    {detail.aadhaar.yearOfBirth ? <div><dt className="text-ink-muted">Year of birth</dt><dd className="mt-1 font-medium">{detail.aadhaar.yearOfBirth}</dd></div> : null}
                    {detail.aadhaar.state ? <div><dt className="text-ink-muted">State on Aadhaar</dt><dd className="mt-1 font-medium">{detail.aadhaar.state}</dd></div> : null}
                    <div><dt className="text-ink-muted">Verified</dt><dd className="mt-1 font-medium">{detail.aadhaar.verifiedAt ? new Date(detail.aadhaar.verifiedAt).toLocaleString("en-IN") : "—"}</dd></div>
                  </dl>
                ) : (
                  <p className="mt-2 text-sm text-amber-900">{detail.aadhaar ? `OTP sent to the mobile linked to ${detail.aadhaar.masked}; not verified yet.` : "The seller has not verified their Aadhaar yet."} The seller can&apos;t be approved until they do.</p>
                )}
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">Payouts</h3>
                  {detail.seller.payoutHoldReason ? (
                    <button type="button" disabled={actionLoading} onClick={() => toggleHold(false)} className="rounded-full bg-green-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40">Resume payouts</button>
                  ) : (
                    <button type="button" disabled={actionLoading} onClick={() => toggleHold(true)} className="rounded-full px-3 py-1.5 text-xs font-bold text-red-700 ring-1 ring-red-200 disabled:opacity-40">Hold payouts</button>
                  )}
                </div>
                {detail.seller.payoutHoldReason ? <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">On hold: {detail.seller.payoutHoldReason}</p> : null}
                {detail.bankAccount ? (
                  <div className="mt-3 text-sm">
                    <p><span className="font-mono">XXXX XXXX {detail.bankAccount.last4}</span> · {detail.bankAccount.ifsc}</p>
                    <p className="mt-0.5 text-ink-muted">{detail.bankAccount.accountHolderName} · added {new Date(detail.bankAccount.addedAt).toLocaleDateString("en-IN")}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className={"rounded-full px-2.5 py-1 text-[11px] font-bold " + (detail.bankAccount.status === "VERIFIED" ? "bg-green-50 text-green-700" : detail.bankAccount.status === "REJECTED" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800")}>{detail.bankAccount.status === "PENDING" ? "Needs verification" : detail.bankAccount.status}</span>
                      {detail.bankAccount.status !== "VERIFIED" ? <button type="button" disabled={actionLoading} onClick={() => void sellerAction("bank-account", { decision: "VERIFIED" })} className="rounded-full bg-green-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40">Verify account</button> : null}
                      {detail.bankAccount.status !== "REJECTED" ? <button type="button" disabled={actionLoading} onClick={rejectBank} className="rounded-full px-3 py-1.5 text-xs font-bold ring-1 ring-slate-300 disabled:opacity-40">Reject</button> : null}
                    </div>
                    {detail.bankAccount.rejectionReason ? <p className="mt-2 text-xs text-red-700">Rejected: {detail.bankAccount.rejectionReason}</p> : null}
                    {detail.bankAccount.status === "PENDING" ? <p className="mt-2 text-xs text-ink-muted">Check the name, last 4 digits and IFSC against the BANK PROOF document below before verifying.</p> : null}
                  </div>
                ) : <p className="mt-2 text-sm text-ink-muted">No bank account added yet. Payouts wait until the seller adds one in Payments.</p>}
                {detail.adBudget ? (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-sm">
                    <span><b>Ad budget</b> {"₹" + (detail.adBudget.availablePaise / 100).toLocaleString("en-IN")} available<span className="block text-xs text-ink-muted">Earnings {"₹" + (detail.adBudget.earningsPaise / 100).toLocaleString("en-IN")} + credit {"₹" + (detail.adBudget.creditLimitPaise / 100).toLocaleString("en-IN")}{detail.seller.adCreditLimitPaise == null ? " (default)" : ""} − {"₹" + (detail.adBudget.usedPaise / 100).toLocaleString("en-IN")} committed</span></span>
                    <button type="button" disabled={actionLoading} onClick={setAdCredit} className="rounded-full px-3 py-1.5 text-xs font-bold ring-1 ring-slate-300 disabled:opacity-40">Change ad credit</button>
                  </div>
                ) : null}
              </div>

              <div className="mt-7">
                <h3 className="font-semibold">Submitted documents</h3>
                {detail.documents.length === 0 ? (
                  <p className="mt-3 text-sm text-ink-muted">No documents submitted.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {detail.documents.map((document) => (
                      <div key={document.id} className="flex flex-col gap-2 rounded-lg bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-medium">{document.type === "GST_ENROLMENT" ? "GST Enrolment acknowledgement" : document.type.replaceAll("_", " ")}</p>
                          <p className="text-xs text-ink-muted">
                            {(document.byteSize / 1024 / 1024).toFixed(2)} MB · {document.mimeType}
                          </p>
                        </div>
                        <a
                          href={`/api/v1/sellers/${selectedId}/documents/${document.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-medium text-saffron underline"
                        >
                          View document
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-7">
                <label className="text-sm font-medium">
                  Review notes
                  <textarea
                    className="mt-2 min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Optional reason or verification note"
                    maxLength={2000}
                  />
                </label>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={actionLoading || detail.verification?.status !== "IN_REVIEW" || detail.aadhaar?.status !== "VERIFIED"}
                    title={detail.aadhaar?.status !== "VERIFIED" ? "The owner's Aadhaar must be verified first" : undefined}
                    onClick={() => void decide("APPROVED")}
                    className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Approve seller
                  </button>
                  <button
                    type="button"
                    disabled={actionLoading || detail.verification?.status !== "IN_REVIEW"}
                    onClick={() => void decide("REJECTED")}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Reject seller
                  </button>
                </div>
                <p className="mt-3 text-xs text-ink-muted">
                  For Enrolment ID sellers, verify the enrolment proof, PAN, business state and eligibility conditions before approval. Approval activates seller access and is recorded in the audit log.
                </p>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
