export type SellerTaxIdentityType = "GSTIN" | "ENROLMENT_ID";

export type SellerTaxProfile = {
  taxIdentityType: SellerTaxIdentityType;
  businessState: string;
  gstin?: string | null;
  gstEnrolmentId?: string | null;
};

export type SellerSupplyCheck = {
  allowed: boolean;
  reason?: string;
};

/**
 * Eligibility helper for the unregistered-supplier / Enrolment ID route.
 * The final order service must call this before accepting an order.
 */
export function checkSellerSupplyToState(
  profile: SellerTaxProfile,
  destinationState: string,
): SellerSupplyCheck {
  const businessState = profile.businessState.trim().toLowerCase();
  const destination = destinationState.trim().toLowerCase();

  if (!businessState || !destination) {
    return { allowed: false, reason: "Seller and destination states are required." };
  }

  if (profile.taxIdentityType === "ENROLMENT_ID" && businessState !== destination) {
    return {
      allowed: false,
      reason: "Enrolment ID sellers cannot accept inter-State goods supplies under this route.",
    };
  }

  if (profile.taxIdentityType === "GSTIN" && !profile.gstin) {
    return {
      allowed: false,
      reason: "GSTIN seller is missing a GSTIN.",
    };
  }

  if (profile.taxIdentityType === "ENROLMENT_ID" && !profile.gstEnrolmentId) {
    return {
      allowed: false,
      reason: "Enrolment ID seller is missing the GST Enrolment ID.",
    };
  }

  return { allowed: true };
}

export function isEnrolmentIdRoute(profile: Pick<SellerTaxProfile, "taxIdentityType">) {
  return profile.taxIdentityType === "ENROLMENT_ID";
}
