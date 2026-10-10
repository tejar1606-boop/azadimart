import AbandonedCarts from "./abandoned-carts";

export const metadata = { title: "Abandoned carts" };

export default function AbandonedCartsPage() {
  return <AbandonedCarts storefrontUrl={(process.env.AUTH_URL_STOREFRONT ?? "").replace(/\/$/, "")} />;
}
