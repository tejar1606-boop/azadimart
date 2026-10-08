"use client";

import { useEffect, useMemo, useState } from "react";

type Seller = {
  id: string;
  storeName: string;
  legalName: string;
  email: string;
  phone: string | null;
  gstin: string | null;
  status: string;
  verificationStatus: string | null;
  documentCount: number;
  approvedAt: string | null;
  createdAt: string;
};

type Detail = {
  seller: Seller & { pan: string | null };
  verification: {
    status: string;
    notes: string | null;
    reviewedAt: string | null;
  } | null;
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
    <main className="px-4 py-6 md:px-8 md:py-10">
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
                    <span>Seller: {seller.status}</span>
                    <span>Documents: {seller.documentCount}</span>
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
                <div><dt className="text-ink-muted">Email</dt><dd className="mt-1 font-medium">{detail.seller.email}</dd></div>
                <div><dt className="text-ink-muted">Phone</dt><dd className="mt-1 font-medium">{detail.seller.phone ?? "—"}</dd></div>
                <div><dt className="text-ink-muted">GSTIN</dt><dd className="mt-1 font-medium">{detail.seller.gstin ?? "—"}</dd></div>
                <div><dt className="text-ink-muted">PAN</dt><dd className="mt-1 font-medium">{detail.seller.pan ?? "—"}</dd></div>
                <div><dt className="text-ink-muted">KYC status</dt><dd className="mt-1 font-medium">{detail.verification?.status ?? "—"}</dd></div>
              </dl>

              <div className="mt-7">
                <h3 className="font-semibold">Submitted documents</h3>
                {detail.documents.length === 0 ? (
                  <p className="mt-3 text-sm text-ink-muted">No documents submitted.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {detail.documents.map((document) => (
                      <div key={document.id} className="flex flex-col gap-2 rounded-lg bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-medium">{document.type}</p>
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
                    disabled={actionLoading || detail.verification?.status !== "IN_REVIEW"}
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
                  Approval activates seller access. The action is recorded in the audit log.
                </p>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
