import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionPrincipal } from "@azadimart/auth";
import { createDatabase } from "@azadimart/database";
import SellersVerification from "../_components/sellers-verification";

export default async function SellersPage() {
  const headerStore = await headers();
  const cookie = headerStore.get("cookie");
  const principal = await getSessionPrincipal(
    new Request("http://azadimart.internal", {
      headers: cookie ? { cookie } : undefined,
    }),
    createDatabase(),
  );

  if (
    !principal ||
    (principal.role !== "ADMIN" && principal.role !== "SUPER_ADMIN")
  ) {
    redirect("/login");
  }

  return <SellersVerification />;
}
