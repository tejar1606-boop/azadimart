import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionPrincipal } from "@azadimart/auth";
import { createDatabase } from "@azadimart/database";
import { PortalAuthLayout } from "@azadimart/ui";

const STEPS = [
  { title: "Register", text: "Create your seller account with your mobile number and email." },
  { title: "Verify your business", text: "Add GST/PAN and bank details. Our team checks them before you start selling." },
  { title: "List your products", text: "Photos, video, colours and sizes. Our team checks each listing before it goes live." },
  { title: "Get orders and get paid", text: "We help with shipping. Money reaches your bank 7 days after delivery." },
];

/** Seller Centre front door: signed-in sellers go straight to work, everyone else sees how selling works. */
export default async function SellerHomePage() {
  const cookie = (await headers()).get("cookie");
  if (cookie) {
    const principal = await getSessionPrincipal(new Request("http://azadimart.internal", { headers: { cookie } }), createDatabase());
    if (principal?.role === "SELLER") redirect("/dashboard");
  }

  return (
    <PortalAuthLayout product="Seller Centre" headline="Sell to customers across India." points={["0% commission for your first 3 months", "Only 5% per order after that, with no listing fees", "Payouts straight to your bank 7 days after delivery"]}>
      <div className="rounded-3xl border border-slate-200/80 bg-white p-7 shadow-card sm:p-9">
        <h1 className="text-2xl font-semibold tracking-[-0.03em]">Start selling on LOIMART</h1>
        <p className="mt-1.5 text-sm text-slate-500">Reach shoppers all over India. Here is how it works:</p>
        <ol className="mt-6 space-y-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand/10 text-sm font-bold text-brand-600">{i + 1}</span>
              <div>
                <p className="text-sm font-semibold">{step.title}</p>
                <p className="mt-0.5 text-sm text-slate-500">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
        <Link href="/register" className="mt-7 block w-full rounded-full bg-brand px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-brand-600">Register as a seller</Link>
        <Link href="/login" className="mt-3 block w-full rounded-full border border-slate-300 px-4 py-3 text-center text-sm font-semibold transition hover:border-slate-900">Already selling? Sign in</Link>
      </div>
    </PortalAuthLayout>
  );
}
