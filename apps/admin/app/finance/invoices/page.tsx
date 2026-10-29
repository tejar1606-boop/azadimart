import { requireStaffPage } from "../../lib/staff-page";
import InvoicesView from "./invoices-view";

export const metadata = { title: "Invoices" };

export default async function InvoicesPage() {
  await requireStaffPage("payments");
  return <InvoicesView />;
}
