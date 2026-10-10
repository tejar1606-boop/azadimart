"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export type AadhaarState = {
  status: "NOT_STARTED" | "OTP_SENT" | "VERIFIED";
  masked?: string;
  nameOnAadhaar?: string | null;
  verifiedAt?: string | null;
  otpExpiresAt?: string | null;
  testMode?: boolean;
};

const formatAadhaar = (v: string) => v.replace(/\D/g, "").slice(0, 12).replace(/(\d{4})(?=\d)/g, "$1 ");

/** Step 1 of KYC: the owner verifies their Aadhaar with an OTP sent to the Aadhaar-linked mobile. */
export default function AadhaarStep({ initial, locked }: { initial: AadhaarState; locked: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<AadhaarState>(initial);
  const [number, setNumber] = useState("");
  const [consent, setConsent] = useState(false);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [changing, setChanging] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const expiresIn = state.otpExpiresAt ? Math.max(0, Math.floor((new Date(state.otpExpiresAt).getTime() - now) / 1000)) : 0;
  const askingOtp = state.status === "OTP_SENT" && expiresIn > 0 && !changing;

  async function post(path: string, body: object) {
    setBusy(true); setError("");
    try {
      const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await response.json().catch(() => null);
      if (!response.ok) throw new Error(json?.error?.message ?? "Something went wrong. Please try again.");
      setState(json.aadhaar);
      return json.aadhaar as AadhaarState;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      return null;
    } finally { setBusy(false); }
  }
  async function sendOtp() {
    const sent = await post("/api/v1/kyc/aadhaar/otp", { aadhaarNumber: number.replace(/\s/g, ""), consent });
    if (sent) { setOtp(""); setChanging(false); setNumber(""); }
  }
  async function verify() {
    const verified = await post("/api/v1/kyc/aadhaar/verify", { otp });
    if (verified?.status === "VERIFIED") router.refresh();
  }

  if (state.status === "VERIFIED") {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-green-200 bg-green-50 p-4 sm:p-5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-green-600 text-white" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-green-900">Aadhaar verified{state.testMode ? <span className="ml-2 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-800">TEST MODE</span> : null}</p>
          <p className="mt-0.5 text-sm text-green-800"><span className="font-mono">{state.masked}</span>{state.nameOnAadhaar ? ` · ${state.nameOnAadhaar}` : ""}{state.verifiedAt ? ` · ${new Date(state.verifiedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : ""}</p>
        </div>
      </div>
    );
  }

  const field = "h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-base outline-none focus:border-slate-900";
  return (
    <div className="rounded-2xl border-2 border-brand/30 bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-brand text-xs font-bold text-white">1</span>
        <h2 className="font-semibold">Verify the owner&apos;s Aadhaar</h2>
        <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-600">Required</span>
      </div>
      <p className="mt-1.5 text-sm text-slate-600">Every seller on AzadiMart verifies the owner or authorised signatory with Aadhaar. We&apos;ll send an OTP to the mobile number linked to the Aadhaar.</p>

      {locked ? (
        <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">Aadhaar can&apos;t be verified while your account is suspended.</p>
      ) : askingOtp ? (
        <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); void verify(); }}>
          <p className="text-sm">OTP sent to the mobile linked to <b className="font-mono">{state.masked}</b>. It expires in {Math.floor(expiresIn / 60)}:{String(expiresIn % 60).padStart(2, "0")}.</p>
          {state.testMode ? <p className="rounded-lg bg-purple-50 px-3 py-2 text-xs text-purple-800">Test mode: no SMS is sent. Use OTP <b>123456</b>.</p> : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit OTP" aria-label="OTP" className={field + " tracking-[0.3em] sm:max-w-[200px]"} />
            <button disabled={busy || otp.length !== 6} className="h-11 rounded-full bg-brand px-6 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-40">{busy ? "Verifying…" : "Verify OTP"}</button>
          </div>
          <button type="button" onClick={() => { setChanging(true); setError(""); }} className="text-xs font-semibold text-slate-600 underline">Use a different Aadhaar or resend OTP</button>
        </form>
      ) : (
        <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); void sendOtp(); }}>
          <input value={number} onChange={(e) => setNumber(formatAadhaar(e.target.value))} inputMode="numeric" autoComplete="off" placeholder="1234 5678 9012" aria-label="Aadhaar number" className={field + " font-mono tracking-wider sm:max-w-xs"} />
          <label className="flex items-start gap-2.5 text-xs leading-5 text-slate-600">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#ff9933]" />
            <span>I agree to AzadiMart verifying my Aadhaar through a UIDAI-licensed partner using OTP, only to confirm my identity as a seller. AzadiMart keeps only the last 4 digits and my name as returned, not the Aadhaar number.</span>
          </label>
          <button disabled={busy || number.replace(/\s/g, "").length !== 12 || !consent} className="h-11 rounded-full bg-chrome px-6 text-sm font-semibold text-white hover:bg-black disabled:opacity-40">{busy ? "Sending OTP…" : "Send OTP"}</button>
          {state.status === "OTP_SENT" && expiresIn === 0 && !changing ? <p className="text-xs text-amber-700">Your last OTP expired. Send a new one.</p> : null}
        </form>
      )}
      {error ? <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
