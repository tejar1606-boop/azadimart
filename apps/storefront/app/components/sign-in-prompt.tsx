import Link from "next/link";

/** Where to come back to after signing in (on-site paths only). */
export const signInHref = (next: string, page: "login" | "register" = "login") => `/${page}?next=${encodeURIComponent(next)}`;

/** Friendly "please sign in" box with Sign in / Create account buttons that bring the shopper back. */
export default function SignInPrompt({ title, text, next, className = "" }: { title: string; text?: string; next: string; className?: string }) {
  return (
    <div role="status" className={"rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center " + className}>
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {text ? <p className="mt-1 text-xs text-slate-600">{text}</p> : null}
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        <Link href={signInHref(next)} className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-black">Sign in</Link>
        <Link href={signInHref(next, "register")} className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 ring-1 ring-slate-300 hover:ring-slate-900">Create account</Link>
      </div>
    </div>
  );
}
