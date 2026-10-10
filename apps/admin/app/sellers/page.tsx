import SellersVerification from "../_components/sellers-verification";
import { requireStaffPage } from "../lib/staff-page";

export const dynamic = "force-dynamic";

export default async function SellersPage() {
  await requireStaffPage("sellers");
  return <SellersVerification />;
}
