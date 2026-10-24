import { requireStaffPage } from "../../lib/staff-page";
import WalletsView from "./wallets-view";

export const metadata = { title: "Seller wallets" };

export default async function SellerWalletsPage() {
  await requireStaffPage("payments");
  return <WalletsView />;
}
