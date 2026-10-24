import GstTable from "./gst-table";
import { requireStaffPage } from "../../lib/staff-page";

export const metadata = { title: "GST & HSN" };

export default async function GstPage() {
  await requireStaffPage("catalog");
  return <GstTable />;
}
