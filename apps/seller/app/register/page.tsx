"use client";

import { FormEvent, useRef, useState } from "react";
import { Turnstile, type TurnstileHandle } from "@azadimart/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";

const STATES = [
  ["AN","Andaman and Nicobar Islands"],["AP","Andhra Pradesh"],["AR","Arunachal Pradesh"],["AS","Assam"],["BR","Bihar"],
  ["CH","Chandigarh"],["CG","Chhattisgarh"],["DN","Dadra and Nagar Haveli and Daman and Diu"],["DL","Delhi"],["GA","Goa"],
  ["GJ","Gujarat"],["HR","Haryana"],["HP","Himachal Pradesh"],["JK","Jammu and Kashmir"],["JH","Jharkhand"],["KA","Karnataka"],
  ["KL","Kerala"],["LA","Ladakh"],["LD","Lakshadweep"],["MP","Madhya Pradesh"],["MH","Maharashtra"],["MN","Manipur"],
  ["ML","Meghalaya"],["MZ","Mizoram"],["NL","Nagaland"],["OD","Odisha"],["PY","Puducherry"],["PB","Punjab"],["RJ","Rajasthan"],
  ["SK","Sikkim"],["TN","Tamil Nadu"],["TS","Telangana"],["TR","Tripura"],["UP","Uttar Pradesh"],["UK","Uttarakhand"],["WB","West Bengal"],
] as const;

type TaxIdentityType = "GSTIN" | "ENROLMENT_ID";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    storeName: "",
    legalName: "",
    email: "",
    phone: "",
    businessState: "",
    taxIdentityType: "GSTIN" as TaxIdentityType,
    gstin: "",
    gstEnrolmentId: "",
    taxDeclarationAccepted: false,
    password: "",
  });
  const [error, setError] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string>();
  const captchaRef = useRef<TurnstileHandle>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const [loading, setLoading] = useState(false);

  function setField(name: keyof typeof form, value: string | boolean) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!form.taxDeclarationAccepted) {
      setError("Please confirm your GST/tax information and eligibility declaration.");
      return;
    }
    setLoading(true);

    try {
      const payload = {
        ...form,
        gstin: form.gstin.trim() || undefined,
        gstEnrolmentId: form.gstEnrolmentId.trim().toUpperCase() || undefined,
        captchaToken,
      };

      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = await response.json();
      if (!response.ok) {
        setError(body?.error?.message ?? "Registration failed. Please check your details.");
        return;
      }

      router.replace("/login");
    } catch {
      setError("Unable to register right now. Please try again.");
    } finally {
      setLoading(false);
      captchaRef.current?.reset();
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-saffron">seller.azadimart.com</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Create seller account</h1>
        <p className="mt-2 text-sm leading-6 text-ink-muted">
          Choose the tax identity route that applies to your business. KYC and admin approval are required before selling.
        </p>

        <form onSubmit={submit} className="mt-8 grid gap-5 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Store name
            <input className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5" value={form.storeName} onChange={(e) => setField("storeName", e.target.value)} required />
          </label>

          <label className="text-sm font-medium">
            Legal name
            <input className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5" value={form.legalName} onChange={(e) => setField("legalName", e.target.value)} required />
          </label>

          <label className="text-sm font-medium">
            Email
            <input className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5" type="email" autoComplete="email" value={form.email} onChange={(e) => setField("email", e.target.value)} required />
          </label>

          <label className="text-sm font-medium">
            Mobile number
            <input className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5" type="tel" inputMode="numeric" maxLength={10} autoComplete="tel" value={form.phone} onChange={(e) => setField("phone", e.target.value.replace(/\D/g, "").slice(0, 10))} required />
          </label>

          <label className="text-sm font-medium">
            Business state / UT
            <select className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5" value={form.businessState} onChange={(e) => setField("businessState", e.target.value)} required>
              <option value="">Select state / UT</option>
              {STATES.map(([code, name]) => <option key={code} value={name}>{name}</option>)}
            </select>
          </label>

          <div className="sm:col-span-2">
            <p className="text-sm font-medium">Tax identity</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setField("taxIdentityType", "GSTIN")}
                className={`rounded-xl border p-4 text-left ${form.taxIdentityType === "GSTIN" ? "border-saffron bg-orange-50" : "border-slate-200"}`}
              >
                <span className="block font-semibold">I have a GSTIN</span>
                <span className="mt-1 block text-xs text-ink-muted">Use your valid GST registration number.</span>
              </button>
              <button
                type="button"
                onClick={() => setField("taxIdentityType", "ENROLMENT_ID")}
                className={`rounded-xl border p-4 text-left ${form.taxIdentityType === "ENROLMENT_ID" ? "border-saffron bg-orange-50" : "border-slate-200"}`}
              >
                <span className="block font-semibold">I have an Enrolment ID</span>
                <span className="mt-1 block text-xs text-ink-muted">For eligible unregistered suppliers of goods.</span>
              </button>
            </div>
          </div>

          {form.taxIdentityType === "GSTIN" ? (
            <label className="text-sm font-medium sm:col-span-2">
              GSTIN
              <input className="mt-2 w-full max-w-xl rounded-lg border border-slate-300 px-3 py-2.5 uppercase" value={form.gstin} onChange={(e) => setField("gstin", e.target.value.toUpperCase())} maxLength={15} autoComplete="off" required />
              <span className="mt-1 block text-xs text-ink-muted">Your GSTIN will be reviewed during KYC.</span>
            </label>
          ) : (
            <div className="sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <label className="text-sm font-medium">
                GST Enrolment ID
                <input className="mt-2 w-full max-w-xl rounded-lg border border-slate-300 bg-white px-3 py-2.5 uppercase" value={form.gstEnrolmentId} onChange={(e) => setField("gstEnrolmentId", e.target.value.replace(/[^a-z0-9]/gi, "").slice(0, 15).toUpperCase())} maxLength={15} autoComplete="off" required />
              </label>
              <p className="mt-2 text-xs leading-5 text-amber-900">
                This route is only for sellers who are eligible under the applicable GST exemption. The seller must have PAN, an enrolled business state/UT, and an enrolment number before supplying through an eligible e-commerce operator. Inter-State goods supplies are not permitted under this route.
              </p>
              <a className="mt-2 inline-block text-xs font-semibold text-saffron underline" href="https://www.gst.gov.in/" target="_blank" rel="noreferrer">
                Get your Enrolment ID on the GST portal →
              </a>
            </div>
          )}

          <label className="flex items-start gap-3 text-sm sm:col-span-2">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={form.taxDeclarationAccepted} onChange={(e) => setField("taxDeclarationAccepted", e.target.checked)} />
            <span className="leading-6">
              I confirm the tax identity and business-state information I submit is accurate. I understand that eligibility for the Enrolment ID route is subject to applicable GST rules and that I must obtain GST registration when legally required.
            </span>
          </label>

          <label className="text-sm font-medium sm:col-span-2">
            Password
            <input className="mt-2 w-full max-w-xl rounded-lg border border-slate-300 px-3 py-2.5" type="password" autoComplete="new-password" minLength={8} value={form.password} onChange={(e) => setField("password", e.target.value)} required />
          </label>

          <Turnstile ref={captchaRef} siteKey={siteKey} onToken={setCaptchaToken} action="register" className="sm:col-span-2" />
          {error ? <p className="text-sm text-red-600 sm:col-span-2">{error}</p> : null}

          <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
            <button className="rounded-lg bg-saffron px-5 py-2.5 font-medium text-white disabled:opacity-60" type="submit" disabled={loading || Boolean(siteKey && !captchaToken)}>
              {loading ? "Creating account…" : "Create seller account"}
            </button>
            <Link href="/login" className="text-sm text-saffron underline">Already registered? Sign in</Link>
          </div>
        </form>
      </div>
    </main>
  );
}