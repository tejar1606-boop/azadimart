import HomeBannersEditor from "./editor";
import { requireStudioPage } from "../lib/staff";

export const metadata = { title: "Home page banners" };

export default async function HomeBannersPage() {
  await requireStudioPage();
  return <HomeBannersEditor />;
}
