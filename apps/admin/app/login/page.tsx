"use client";

import { FormEvent, useRef, useState } from "react";
import { Turnstile, type TurnstileHandle } from "@azadimart/ui";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string>();
  const captchaRef = useRef<TurnstileHandle>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, captchaToken }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body?.error?.message ?? "Login failed. Please check your details.");
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Unable to sign in right now. Please try again.");
    } finally {
      setLoading(false);
      captchaRef.current?.reset();
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm uppercase tracking-wide text-ink-muted">AzadiMart</p>
        <h1 className="mt-2 text-3xl font-semibold">Sign in</h1>
        <label className="mt-8 block text-sm font-medium">
          Email
          <input className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="mt-4 block text-sm font-medium">
          Password
          <input className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <Turnstile ref={captchaRef} siteKey={siteKey} onToken={setCaptchaToken} action="login" className="mt-4" />
        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
        <button className="mt-6 w-full rounded-lg bg-saffron px-4 py-2 font-medium text-white disabled:opacity-60" type="submit" disabled={loading || Boolean(siteKey && !captchaToken)}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
