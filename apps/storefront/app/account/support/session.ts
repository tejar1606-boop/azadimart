import { getSessionPrincipal } from "@azadimart/auth";
import { createDatabase } from "@azadimart/database";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

/** Support pages need a signed-in customer; others go to sign in and come back. */
export async function requireCustomerPage(next: string) {
  const cookie = (await headers()).get("cookie") ?? "";
  const principal = cookie ? await getSessionPrincipal(new Request("http://azadimart.internal", { headers: { cookie } }), createDatabase()).catch(() => null) : null;
  if (principal?.role !== "CUSTOMER") redirect(`/login?next=${encodeURIComponent(next)}`);
}
