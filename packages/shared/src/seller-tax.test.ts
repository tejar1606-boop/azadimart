import { describe, expect, it } from "vitest";
import { sellerRegistrationSchema } from "./validation";
import { checkSellerSupplyToState, isEnrolmentIdRoute } from "./seller-tax";

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
    expect(sellerRegistrationSchema.safeParse({ ...base, taxIdentityType: "GSTIN", gstin: "29ABCDE1234F1Z5" }).success).toBe(true);
  });
  it("accepts a valid 15-character Enrolment ID seller", () => {
    expect(sellerRegistrationSchema.safeParse({ ...base, taxIdentityType: "ENROLMENT_ID", gstEnrolmentId: "372600068070ESF" }).success).toBe(true);
  });
  it("rejects an Enrolment ID with the wrong length", () => {
    expect(sellerRegistrationSchema.safeParse({ ...base, taxIdentityType: "ENROLMENT_ID", gstEnrolmentId: "12345" }).success).toBe(false);
  });
  it("rejects GSTIN route without GSTIN", () => {
    expect(sellerRegistrationSchema.safeParse({ ...base, taxIdentityType: "GSTIN" }).success).toBe(false);
  });
  it("rejects an Enrolment ID route that also supplies a GSTIN", () => {
    expect(sellerRegistrationSchema.safeParse({ ...base, taxIdentityType: "ENROLMENT_ID", gstEnrolmentId: "372600068070ESF", gstin: "29ABCDE1234F1Z5" }).success).toBe(false);
  });
  it("requires the seller tax declaration", () => {
    expect(sellerRegistrationSchema.safeParse({ ...base, taxIdentityType: "ENROLMENT_ID", gstEnrolmentId: "372600068070ESF", taxDeclarationAccepted: false }).success).toBe(false);
  });
});

describe("seller tax supply policy", () => {
  it("allows a GSTIN seller across states", () => {
    expect(checkSellerSupplyToState({ taxIdentityType: "GSTIN", businessState: "Karnataka", gstin: "29ABCDE1234F1Z5" }, "Maharashtra").allowed).toBe(true);
  });
  it("allows an Enrolment ID seller within the same state", () => {
    expect(checkSellerSupplyToState({ taxIdentityType: "ENROLMENT_ID", businessState: "Karnataka", gstEnrolmentId: "372600068070ESF" }, "karnataka").allowed).toBe(true);
  });
  it("blocks an Enrolment ID seller from inter-State supply", () => {
    const result = checkSellerSupplyToState({ taxIdentityType: "ENROLMENT_ID", businessState: "Karnataka", gstEnrolmentId: "372600068070ESF" }, "Telangana");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("inter-State");
  });
  it("blocks missing tax identity data", () => {
    expect(checkSellerSupplyToState({ taxIdentityType: "GSTIN", businessState: "Karnataka" }, "Karnataka").allowed).toBe(false);
  });
  it("identifies the Enrolment ID route", () => {
    expect(isEnrolmentIdRoute({ taxIdentityType: "ENROLMENT_ID" })).toBe(true);
    expect(isEnrolmentIdRoute({ taxIdentityType: "GSTIN" })).toBe(false);
  });
});
