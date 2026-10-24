"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Shown when a page fails to load (for example a brief database outage); retrying usually fixes it. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="grid min-h-[60vh] place-items-center px-4 py-16">
      <div className="max-w-md text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand/10 text-xl text-brand-600" aria-hidden="true">!</span>
        <h1 className="mt-5 text-2xl font-semibold tracking-[-0.03em]">Something went wrong</h1>
        <p className="mt-2 text-sm text-slate-500">We couldn&apos;t load this page. Please try again in a moment.</p>
        <div className="mt-6 flex justify-center gap-2">
          <button type="button" onClick={() => reset()} className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600">Try again</button>
          <Link href="/" className="rounded-full px-5 py-2.5 text-sm font-semibold ring-1 ring-slate-300 hover:ring-slate-900">Go home</Link>
        </div>
        {error.digest ? <p className="mt-6 text-xs text-slate-400">Reference: {error.digest}</p> : null}
      </div>
    </main>
  );
}
