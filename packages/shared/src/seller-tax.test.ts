import { describe, expect, it } from "vitest";
import { sellerRegistrationSchema } from "./validation";

const base = {
  storeName: "Test Store",
  legalName: "Test Seller",
  email: "seller@example.com",
  phone: "9876543210",
  businessState: "Karnataka",
  password: "StrongPass@2026",
  taxDeclarationAccepted: true,
};

describe("seller tax identity validation", () => {
  it("accepts a valid GSTIN seller", () => {
    const result = sellerRegistrationSchema.safeParse({
      ...base,
      taxIdentityType: "GSTIN",
      gstin: "29ABCDE1234F1Z5",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid 15-character Enrolment ID seller", () => {
    const result = sellerRegistrationSchema.safeParse({
      ...base,
      taxIdentityType: "ENROLMENT_ID",
      gstEnrolmentId: "372600068070ESF",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an Enrolment ID with the wrong length", () => {
    const result = sellerRegistrationSchema.safeParse({
      ...base,
      taxIdentityType: "ENROLMENT_ID",
      gstEnrolmentId: "12345",
    });
    expect(result.success).toBe(false);
  });

  it("rejects GSTIN route without GSTIN", () => {
    const result = sellerRegistrationSchema.safeParse({
      ...base,
      taxIdentityType: "GSTIN",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an Enrolment ID route that also supplies a GSTIN", () => {
    const result = sellerRegistrationSchema.safeParse({
      ...base,
      taxIdentityType: "ENROLMENT_ID",
      gstEnrolmentId: "372600068070ESF",
      gstin: "29ABCDE1234F1Z5",
    });
    expect(result.success).toBe(false);
  });

  it("requires the seller tax declaration", () => {
    const result = sellerRegistrationSchema.safeParse({
      ...base,
      taxIdentityType: "ENROLMENT_ID",
      gstEnrolmentId: "372600068070ESF",
      taxDeclarationAccepted: false,
    });
    expect(result.success).toBe(false);
  });
});
