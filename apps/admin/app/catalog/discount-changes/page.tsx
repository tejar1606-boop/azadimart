import DiscountChanges from "./discount-changes";
import { requireStaffPage } from "../../lib/staff-page";

export const metadata = { title: "Discount changes" };

export default async function DiscountChangesPage() {
  await requireStaffPage("catalog");
  return <DiscountChanges />;
}
