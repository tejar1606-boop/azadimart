import { STUDIO_URL } from "@azadimart/shared";
import { redirect } from "next/navigation";

/** Page banners moved to the separate Banner Studio. */
export default function PageBannersMoved() {
  redirect(STUDIO_URL + "/page-banners");
}
