import AdsAdmin from "./ads-admin";
import { requireStudioPage } from "../lib/staff";

export const metadata = { title: "Seller ad banners" };

export default async function SellerAdsPage() {
  await requireStudioPage();
  return <AdsAdmin storefrontUrl={(process.env.AUTH_URL_STOREFRONT ?? "").replace(/\/$/, "")} />;
}
