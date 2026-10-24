import { STUDIO_URL } from "@azadimart/shared";
import { redirect } from "next/navigation";

/** Seller ad approvals moved to the separate Banner Studio. */
export default function SellerAdsMoved() {
  redirect(STUDIO_URL + "/seller-ads");
}
