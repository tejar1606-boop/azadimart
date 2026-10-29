"use client";

import { type FormEvent, useEffect, useState } from "react";

const RESEND_SECONDS = 30;

/** Asks the app whether OTP login can be offered (an SMS provider is set up). */
export function useOtpAvailable(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let live = true;
    fetch("/api/auth/otp/request", { cache: "no-store" }).then((r) => r.json()).then((b) => { if (live) setAvailable(Boolean(b?.available)); }).catch(() => {});
    return () => { live = false; };
  }, []);
  return available;
}

/** Password / OTP switch shown above the sign-in form. */
export function LoginMethodTabs({ method, onChange, activeClassName = "bg-white text-slate-950 shadow-sm" }: { method: "password" | "otp"; onChange: (m: "password" | "otp") => void; activeClassName?: string }) {
  return (
    <div role="tablist" aria-label="Sign-in method" className="grid grid-cols-2 rounded-full bg-slate-100 p-1 text-sm font-semibold">
      {(["password", "otp"] as const).map((m) => (
        <button key={m} type="button" role="tab" aria-selected={method === m} onClick={() => onChange(m)} className={"rounded-full px-4 py-2 transition " + (method === m ? activeClassName : "text-slate-500 hover:text-slate-800")}>
          {m === "password" ? "Password" : "Mobile OTP"}
        </button>
      ))}
    </div>
  );
}

/**
 * Sign in with a code sent by SMS to the account's mobile number:
 * phone → Send code → 6-digit code → signed in (onSuccess).
 */
export function OtpLoginForm({ onSuccess, buttonClassName, inputClassName = "w-full rounded-xl border border-slate-200 px-4 py-3 text-[15px] outline-none focus:border-slate-900" }: { onSuccess: () => void; buttonClassName: string; inputClassName?: string }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [devCode, setDevCode] = useState("");
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [wait]);

  async function send(event?: FormEvent) {
    event?.preventDefault();
    setError(""); setBusy(true);
    try {
      const response = await fetch("/api/auth/otp/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message ?? "Couldn't send the code. Please try again.");
      setDevCode(body?.devCode ?? ""); setCode(""); setStep("code"); setWait(RESEND_SECONDS);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the code. Please try again.");
    } finally { setBusy(false); }
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    setError(""); setBusy(true);
    try {
      const response = await fetch("/api/auth/otp/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, code }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message ?? "That code didn't work. Please try again.");
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code didn't work. Please try again.");
      setBusy(false);
    }
  }

  if (step === "phone") {
    return (
      <form onSubmit={send} className="space-y-4">
        <label className="block text-sm font-semibold text-slate-800">Mobile number
          <div className="mt-1.5 flex items-center gap-2">
            <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-[15px] font-semibold text-slate-600">+91</span>
            <input className={inputClassName} type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={10} placeholder="10-digit mobile" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} required />
          </div>
        </label>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <button disabled={busy || !/^[6-9]\d{9}$/.test(phone)} className={buttonClassName}>{busy ? "Sending…" : "Send code"}</button>
        <p className="text-center text-xs text-slate-500">We&apos;ll text a 6-digit code to the mobile number on your account.</p>
      </form>
    );
  }

  return (
    <form onSubmit={verify} className="space-y-4">
      <p className="text-sm text-slate-600">If <b className="text-slate-900">+91 {phone}</b> has an account, a 6-digit code is on its way. <button type="button" onClick={() => { setStep("phone"); setError(""); }} className="font-semibold text-slate-900 underline">Change number</button></p>
      {devCode ? <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">Testing mode (no SMS sent): your code is <b className="tracking-widest">{devCode}</b></p> : null}
      <label className="block text-sm font-semibold text-slate-800">Enter code
        <input className={inputClassName + " mt-1.5 text-center text-2xl font-bold tracking-[0.5em]"} type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} required autoFocus />
      </label>
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      <button disabled={busy || code.length !== 6} className={buttonClassName}>{busy ? "Signing in…" : "Verify & sign in"}</button>
      <p className="text-center text-sm text-slate-500">
        {wait > 0 ? <>Resend code in {wait}s</> : <button type="button" onClick={() => void send()} disabled={busy} className="font-semibold text-slate-900 underline">Resend code</button>}
      </p>
    </form>
  );
}
