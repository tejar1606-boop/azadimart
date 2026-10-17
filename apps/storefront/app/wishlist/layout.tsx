import PageBanner from "../components/page-banner";

/** Banner from Admin → Page banners, above every wishlist page. */
export default function WishlistLayout({ children }: { children: React.ReactNode }) {
  return <><PageBanner pageKey="wishlist" />{children}</>;
}
