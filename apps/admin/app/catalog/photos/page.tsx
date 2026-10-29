import { PortalPageHeader } from "@azadimart/ui";
import CategoryPhotos from "../../online-store/category-photos";
import { requireStaffPage } from "../../lib/staff-page";

export const metadata = { title: "Category photos" };

/** Photos for main categories and sub-categories, on their own page (also shown in Online Store). */
export default async function CategoryPhotosPage() {
  await requireStaffPage("catalog");
  return (
    <main className="space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader eyebrow="Catalogue" title="Category photos" description="Upload a square photo (600 × 600 px) for each category and sub-category. Saved as soon as you upload." />
      <CategoryPhotos />
    </main>
  );
}
