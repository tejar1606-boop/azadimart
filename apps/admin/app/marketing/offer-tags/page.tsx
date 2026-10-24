import OfferTagsManager from "./offer-tags-manager";

export const metadata = { title: "Offer tags" };

export default function OfferTagsPage() {
  return <OfferTagsManager storefrontUrl={(process.env.AUTH_URL_STOREFRONT ?? "").replace(/\/$/, "")} />;
}
