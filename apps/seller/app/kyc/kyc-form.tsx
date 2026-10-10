"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AadhaarStep, { type AadhaarState } from "./aadhaar-step";

type TaxIdentityType = "GSTIN" | "ENROLMENT_ID";
export type DocType = "GST" | "GST_ENROLMENT" | "PAN" | "BANK_PROOF" | "ADDRESS_PROOF" | "IDENTITY";
export type KycStage = "TODO" | "REJECTED" | "IN_REVIEW" | "VERIFIED" | "SUSPENDED";
type Uploaded = { type: DocType; mediaAssetId: string; fileName: string; uploadedAt?: string };
type Slot = { type: DocType; title: string; accepted: string; required: boolean };

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp";
const MAX_MB = 10;

/** Every document a seller may need, shown at once so nothing is hidden behind a menu. */
function slotsFor(taxIdentityType: TaxIdentityType): Slot[] {
  return [
    taxIdentityType === "ENROLMENT_ID"
      ? { type: "GST_ENROLMENT", title: "GST Enrolment ID proof", accepted: "Screenshot or PDF of the enrolment confirmation from the GST portal or its email", required: true }
      : { type: "GST", title: "GST certificate", accepted: "GST registration certificate (Form REG-06) as PDF or photo", required: true },
    { type: "PAN", title: "PAN card", accepted: "PAN of the business, or of the owner for a sole proprietor", required: true },
    { type: "BANK_PROOF", title: "Bank proof", accepted: "Cancelled cheque, passbook first page or a bank statement showing account name, number and IFSC", required: true },
    { type: "ADDRESS_PROOF", title: "Business address proof", accepted: "Electricity bill, rent agreement, property tax receipt or Udyam certificate for your pickup address", required: true },
    { type: "IDENTITY", title: "Owner identity proof", accepted: "Passport, voter ID, driving licence or masked Aadhaar (first 8 digits hidden) of the owner or authorised signatory", required: false },
  ];
}

function Icon({ done }: { done: boolean }) {
  return done ? (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-green-100 text-green-700" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
    </span>
  ) : (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5" /></svg>
    </span>
  );
}

const BANNERS: Record<Exclude<KycStage, "TODO">, { tone: string; title: string; body: string }> = {
  VERIFIED: { tone: "border-green-200 bg-green-50 text-green-900", title: "Your business is verified", body: "Your KYC is approved and you can sell on AzadiMart. To change a document (for example a new bank account), contact AzadiMart seller support." },
  IN_REVIEW: { tone: "border-amber-200 bg-amber-50 text-amber-900", title: "Your documents are under review", body: "Our team usually reviews KYC within 1–2 working days. You'll be able to make changes again if anything needs fixing." },
  REJECTED: { tone: "border-red-200 bg-red-50 text-red-900", title: "Some documents need attention", body: "Replace the documents mentioned below and submit again." },
  SUSPENDED: { tone: "border-red-200 bg-red-50 text-red-900", title: "Your seller account is suspended", body: "Documents can't be changed while the account is suspended. Please contact AzadiMart seller support." },
};

export default function KycForm({ stage, reviewNotes, taxIdentityType, taxNumber, businessState, aadhaar, existing }: {
  stage: KycStage;
  reviewNotes: string | null;
  taxIdentityType: TaxIdentityType;
  taxNumber: string | null;
  businessState: string | null;
  aadhaar: AadhaarState;
  existing: Uploaded[];
}) {
  const router = useRouter();
  const slots = slotsFor(taxIdentityType);
  const editable = stage === "TODO" || stage === "REJECTED";
  const [documents, setDocuments] = useState<Uploaded[]>(existing);
  const [uploading, setUploading] = useState<DocType | null>(null);
  const [errors, setErrors] = useState<Partial<Record<DocType, string>>>({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputs = useRef<Partial<Record<DocType, HTMLInputElement | null>>>({});

  const required = slots.filter((s) => s.required);
  const doneCount = required.filter((s) => documents.some((d) => d.type === s.type)).length;
  const aadhaarDone = aadhaar.status === "VERIFIED";
  const ready = doneCount === required.length && aadhaarDone;

  async function upload(slot: Slot, file: File) {
    setErrors((e) => ({ ...e, [slot.type]: undefined })); setError(""); setMessage("");
    if (file.size > MAX_MB * 1024 * 1024) { setErrors((e) => ({ ...e, [slot.type]: `The file is larger than ${MAX_MB} MB. Please upload a smaller file.` })); return; }
    setUploading(slot.type);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/v1/media/documents", { method: "POST", body: form });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message ?? "Upload failed. Please try again.");
      setDocuments((current) => [...current.filter((d) => d.type !== slot.type), { type: slot.type, mediaAssetId: body.mediaAssetId, fileName: body.fileName }]);
    } catch (err) {
      setErrors((e) => ({ ...e, [slot.type]: err instanceof Error ? err.message : "Upload failed. Please try again." }));
    } finally { setUploading(null); }
  }

  async function submit() {
    setError(""); setMessage("");
    if (!aadhaarDone) { setError("Verify the owner's Aadhaar first (step 1)."); return; }
    if (!ready) { setError("Please upload all required documents first."); return; }
    setSubmitting(true);
    try {
      const response = await fetch("/api/v1/kyc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documents: documents.filter((d) => slots.some((s) => s.type === d.type)).map(({ type, mediaAssetId }) => ({ type, mediaAssetId })) }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message ?? "KYC submission failed.");
      setMessage("Submitted. Our team will review your documents within 1–2 working days.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "KYC submission failed. Please try again.");
    } finally { setSubmitting(false); }
  }

  const banner = stage === "TODO" ? null : BANNERS[stage];

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="space-y-4">
        {banner ? (
          <div className={"rounded-2xl border p-4 " + banner.tone} role="status">
            <p className="font-semibold">{banner.title}</p>
            <p className="mt-1 text-sm opacity-90">{banner.body}</p>
            {stage === "REJECTED" && reviewNotes ? <p className="mt-3 rounded-xl bg-white/70 p-3 text-sm"><b>Reviewer&apos;s note:</b> {reviewNotes}</p> : null}
          </div>
        ) : null}

        {stage === "VERIFIED" && !aadhaarDone ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900" role="status">
            <p className="font-semibold">Action needed: verify your Aadhaar</p>
            <p className="mt-1 text-sm opacity-90">Aadhaar verification is now required for every AzadiMart seller. It takes a minute with an OTP.</p>
          </div>
        ) : null}
        <AadhaarStep initial={aadhaar} locked={stage === "SUSPENDED"} />

        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="flex items-center gap-2 font-semibold">{editable ? <span className="grid h-7 w-7 place-items-center rounded-full bg-brand text-xs font-bold text-white">2</span> : null}Documents</h2>
              <p className="text-xs text-slate-500">PDF, JPG, PNG or WebP · up to {MAX_MB} MB each · clear and fully visible</p>
            </div>
            {editable ? <span className={"rounded-full px-3 py-1 text-xs font-semibold " + (ready ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-600")}>{doneCount} of {required.length} required uploaded</span> : null}
          </div>
          <ul className="divide-y divide-slate-100">
            {slots.map((slot) => {
              const doc = documents.find((d) => d.type === slot.type);
              const busy = uploading === slot.type;
              return (
                <li key={slot.type} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                  <Icon done={Boolean(doc)} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      {slot.title}
                      {editable ? <span className={"rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide " + (slot.required ? "bg-brand/10 text-brand-600" : "bg-slate-100 text-slate-500")}>{slot.required ? "Required" : "Optional"}</span> : null}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">{slot.accepted}</p>
                    {doc ? <p className="mt-1 truncate text-xs font-medium text-green-700">✓ {doc.fileName}{doc.uploadedAt ? ` · on file since ${new Date(doc.uploadedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : " · uploaded"}</p> : null}
                    {errors[slot.type] ? <p className="mt-1 text-xs font-medium text-red-600">{errors[slot.type]}</p> : null}
                  </div>
                  {editable ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <input ref={(el) => { inputs.current[slot.type] = el; }} type="file" accept={ACCEPT} hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(slot, f); e.currentTarget.value = ""; }} />
                      <button type="button" disabled={Boolean(uploading) || submitting} onClick={() => inputs.current[slot.type]?.click()} className={"rounded-full px-4 py-2 text-xs font-semibold transition disabled:opacity-50 " + (doc ? "text-slate-700 ring-1 ring-slate-300 hover:ring-slate-900" : "bg-chrome text-white hover:bg-black")}>
                        {busy ? "Uploading…" : doc ? "Replace" : "Upload"}
                      </button>
                      {doc && !slot.required ? <button type="button" onClick={() => setDocuments((all) => all.filter((d) => d.type !== slot.type))} className="text-xs font-semibold text-red-600">Remove</button> : null}
                    </div>
                  ) : (
                    <span className={"shrink-0 text-xs font-semibold " + (doc ? "text-green-700" : "text-slate-400")}>{doc ? "On file" : "Not on file"}</span>
                  )}
                </li>
              );
            })}
          </ul>
          {editable ? (
            <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500">{aadhaarDone ? "Your documents are stored privately and only used to verify your business." : "Verify your Aadhaar in step 1 to submit."}</p>
              <button type="button" onClick={() => void submit()} disabled={!ready || submitting || Boolean(uploading)} className="rounded-full bg-brand px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-40">
                {submitting ? "Submitting…" : stage === "REJECTED" ? "Submit again" : "Submit for verification"}
              </button>
            </div>
          ) : null}
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {message ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{message}</p> : null}
      </section>

      <aside className="space-y-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Tax identity</p>
          <p className="mt-2 text-sm font-semibold">{taxIdentityType === "ENROLMENT_ID" ? "GST Enrolment ID (no GSTIN)" : "GSTIN"}</p>
          <p className="mt-0.5 font-mono text-sm">{taxNumber ?? "Not provided"}</p>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Business state / UT</p>
          <p className="mt-1 text-sm">{businessState ?? "Not provided"}</p>
          {taxIdentityType === "ENROLMENT_ID" ? (
            <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
              Sellers with an Enrolment ID can sell only to customers in <b>{businessState ?? "their own state"}</b>, as GST rules require. Get a GSTIN any time to sell across India.
            </p>
          ) : null}
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 text-sm shadow-card">
          <p className="font-semibold">Tips for a quick approval</p>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs leading-5 text-slate-600">
            <li>Names on PAN, bank proof and GST should match your legal name.</li>
            <li>Photos must be sharp, with all four corners visible.</li>
            <li>The address proof should match your pickup address.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
