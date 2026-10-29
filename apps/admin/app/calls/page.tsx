import { Suspense } from "react";
import { requireStaffPage } from "../lib/staff-page";
import CallCentre from "./call-centre";

export const metadata = { title: "Call centre" };

export default async function CallsPage() {
  await requireStaffPage("support");
  return <Suspense><CallCentre /></Suspense>;
}
