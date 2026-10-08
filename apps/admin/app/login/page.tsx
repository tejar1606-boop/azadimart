"use client";

import { FormEvent, useRef, useState } from "react";
import { PortalAuthLayout, Turnstile, type TurnstileHandle } from "@azadimart/ui";
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
    <PortalAuthLayout product="Admin console" headline="Run the marketplace with confidence." points={["Review sellers, products and A+ content","Manage orders, payments and refunds","Publish the storefront in a few clicks"]}>
      <form onSubmit={submit} className="rounded-3xl border border-slate-200/80 bg-white p-7 shadow-card sm:p-9">
        <h1 className="text-2xl font-semibold tracking-[-0.03em]">Sign in to Admin</h1>
        <p className="mt-1.5 text-sm text-slate-500">Use your AzadiMart administrator account.</p>
        <label className="mt-7 block text-sm font-medium">
          Email
          <input className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="mt-4 block text-sm font-medium">
          Password
          <input className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <Turnstile ref={captchaRef} siteKey={siteKey} onToken={setCaptchaToken} action="login" className="mt-4" />
        {error ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <button className="mt-6 w-full rounded-full bg-brand px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60" type="submit" disabled={loading || Boolean(siteKey && !captchaToken)}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </PortalAuthLayout>
  );
}
