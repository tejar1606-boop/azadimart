import PageBanners from "./page-banners";
import { requireStudioPage } from "../lib/staff";

export const metadata = { title: "Page banners" };

export default async function PageBannersPage() {
  await requireStudioPage();
  return <PageBanners />;
}
