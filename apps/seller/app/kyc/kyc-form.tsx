"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type TaxIdentityType = "GSTIN" | "ENROLMENT_ID";
type DocType = "GST" | "GST_ENROLMENT" | "PAN" | "BANK_PROOF" | "ADDRESS_PROOF" | "IDENTITY";
type Uploaded = { type: DocType; mediaAssetId: string; fileName: string };

const BASE_TYPES: Array<[Exclude<DocType, "GST" | "GST_ENROLMENT">, string]> = [
  ["PAN", "PAN card"],
  ["BANK_PROOF", "Bank proof"],
  ["ADDRESS_PROOF", "Address proof"],
  ["IDENTITY", "Identity proof"],
];

export default function KycForm({
  taxIdentityType,
  gstin,
  gstEnrolmentId,
  businessState,
}: {
  taxIdentityType: TaxIdentityType;
  gstin: string | null;
  gstEnrolmentId: string | null;
  businessState: string | null;
}) {
  const router = useRouter();
  const types: Array<[DocType, string]> = taxIdentityType === "ENROLMENT_ID"
    ? [["GST_ENROLMENT", "GST Enrolment acknowledgement"], ...BASE_TYPES]
    : [["GST", "GST certificate"], ...BASE_TYPES];

  const [type, setType] = useState<DocType>(types[0]?.[0] ?? "PAN");
  const [file, setFile] = useState<File | null>(null);
  const [documents, setDocuments] = useState<Uploaded[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function uploadDocument() {
    setError("");
    setMessage("");
    if (!file) {
      setError("Select a document first.");
      return;
    }
    if (documents.some((document) => document.type === type)) {
      setError("That document type has already been added.");
      return;
    }

    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/v1/media/documents", { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) {
        setError(body?.error?.message ?? "Upload failed.");
        return;
      }

      setDocuments((current) => [...current, { type, mediaAssetId: body.mediaAssetId, fileName: body.fileName }]);
      setFile(null);
      const input = document.getElementById("kyc-file") as HTMLInputElement | null;
      if (input) input.value = "";
      setMessage(body.fileName + " uploaded.");
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitKyc() {
    setError("");
    setMessage("");

    const requiredTypes: DocType[] = ["PAN", "BANK_PROOF", "ADDRESS_PROOF", taxIdentityType === "ENROLMENT_ID" ? "GST_ENROLMENT" : "GST"];
    const missing = requiredTypes.filter((required) => !documents.some((document) => document.type === required));
    if (missing.length > 0) {
      const labels = new Map(types);
      setError("Please upload the required documents: " + missing.map((item) => labels.get(item) ?? item).join(", ") + ".");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/v1/kyc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documents: documents.map(({ type: documentType, mediaAssetId }) => ({ type: documentType, mediaAssetId })),
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body?.error?.message ?? "KYC submission failed.");
        return;
      }

      setMessage("KYC submitted successfully. Admin review is now pending.");
      setTimeout(() => router.refresh(), 300);
    } catch {
      setError("KYC submission failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const taxValue = taxIdentityType === "ENROLMENT_ID" ? gstEnrolmentId : gstin;

  return (
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Tax identity</p>
        <p className="mt-1 font-semibold">{taxIdentityType === "ENROLMENT_ID" ? "GST Enrolment ID" : "GSTIN"}</p>
        <p className="mt-1 font-mono text-sm">{taxValue ?? "Not provided"}</p>
        <p className="mt-2 text-xs text-ink-muted">Business state / UT: {businessState ?? "Not provided"}</p>
        {taxIdentityType === "ENROLMENT_ID" ? (
          <p className="mt-3 text-xs leading-5 text-amber-800">
            Enrolment ID sellers are eligible only under the applicable GST rules and conditions. AzadiMart will review the enrolment proof before activation.
          </p>
        ) : null}
      </div>

      <div className="mt-5">
        <p className="text-sm font-semibold">Required KYC documents</p>
        <p className="mt-1 text-xs text-ink-muted">PAN, bank proof, address proof, and your selected tax-identity proof are required before admin review.</p>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <label className="text-sm font-medium">
          Document type
          <select className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2" value={type} onChange={(e) => setType(e.target.value as DocType)}>
            {types.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>

        <label className="text-sm font-medium">
          File
          <input id="kyc-file" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>

        <button type="button" onClick={uploadDocument} disabled={busy} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-60">{busy ? "Working…" : "Upload"}</button>
      </div>

      {documents.length > 0 ? (
        <div className="mt-6 space-y-2">
          {documents.map((document) => (
            <div key={document.mediaAssetId} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <span>{document.type} — {document.fileName}</span>
              <span className="text-green-700">Uploaded</span>
            </div>
          ))}
        </div>
      ) : null}

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      {message ? <p className="mt-4 text-sm text-green-700">{message}</p> : null}

      <button type="button" onClick={submitKyc} disabled={busy || documents.length === 0} className="mt-6 rounded-lg bg-saffron px-5 py-2 font-medium text-white disabled:opacity-60">Submit KYC for review</button>

      <p className="mt-4 text-xs text-ink-muted">
        Documents are private seller files. Production object storage must be configured before deployment.
      </p>
    </section>
  );
}