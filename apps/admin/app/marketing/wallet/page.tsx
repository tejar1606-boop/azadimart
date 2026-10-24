import { requireStaffPage } from "../../lib/staff-page";
import WalletAdmin from "./wallet-admin";

export const metadata = { title: "Wallet & welcome bonus" };

export default async function WalletAdminPage() {
  await requireStaffPage("marketing");
  return <WalletAdmin />;
}
