import { requireStaffPage } from "../../lib/staff-page";
import TaxReport from "./tax-report";

export const metadata = { title: "TCS & TDS" };

export default async function TaxReportPage() {
  await requireStaffPage("payments");
  return <TaxReport />;
}
