"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import PayslipDocument, { type PayslipData } from "../../components/payslip-document";

export default function PayslipPage() {
  const { payslipId } = useParams<{ payslipId: string }>();
  const [slip, setSlip] = useState<PayslipData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void fetch(`/api/v1/payslips/${payslipId}`, { cache: "no-store" }).then(async (r) => {
      if (r.status === 401) { window.location.replace("/login"); return; }
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error?.message ?? "Unable to load the payslip.");
      setSlip(b.payslip);
    }).catch((e) => setError(e instanceof Error ? e.message : "Unable to load the payslip."));
  }, [payslipId]);
  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <button type="button" onClick={() => history.back()} className="slip-noprint text-sm font-semibold text-slate-500 hover:text-slate-900">← Back</button>
      <div className="mt-4">{error ? <p className="rounded-2xl bg-white p-8 text-center font-semibold">{error} <Link href="/" className="underline">Home</Link></p> : slip ? <PayslipDocument slip={slip} /> : <div className="h-96 animate-pulse bg-white" />}</div>
    </main>
  );
}
