import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionPrincipal } from "@azadimart/auth";
import { createDatabase } from "@azadimart/database";
import { AdminScreen } from "../_components/admin-screen";

async function requireAdminSession() {
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

  return principal;
}

export default async function Page() {
  await requireAdminSession();

  return (
    <AdminScreen
      title="Dashboard"
      description="Operational snapshot for orders, sellers awaiting approval, QC queue, and payouts."
    />
  );
}
