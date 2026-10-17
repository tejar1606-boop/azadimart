import AdsAdmin from "./ads-admin";

export const metadata = { title: "Seller ads" };

export default function SellerAdsPage() {
  return <AdsAdmin storefrontUrl={(process.env.AUTH_URL_STOREFRONT ?? "").replace(/\/$/, "")} />;
}
