import PageBanner from "../components/page-banner";

/** Banner from Admin → Page banners, above every account page. */
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <><PageBanner pageKey="account" />{children}</>;
}
