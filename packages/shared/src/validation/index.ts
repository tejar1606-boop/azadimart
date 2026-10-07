import { z } from "zod";
import { ROLES } from "../roles";
import { PRODUCT_MEDIA_LIMITS } from "../routes";

export const uuidSchema = z.string().uuid();
export const paginationSchema = z.object({ page:z.coerce.number().int().min(1).default(1), pageSize:z.coerce.number().int().min(1).max(100).default(20) });
export const moneySchema = z.object({ amountPaise:z.number().int().nonnegative(), currency:z.literal("INR").default("INR") });

export const sellerRegistrationSchema = z.object({
  storeName:z.string().trim().min(2).max(120), legalName:z.string().trim().min(2).max(160), email:z.string().email(),
  phone:z.string().regex(/^[6-9]\d{9}$/, "Enter a valid Indian mobile number"),
  businessState:z.string().trim().min(2).max(80),
  taxIdentityType:z.enum(["GSTIN","ENROLMENT_ID"]),
  gstin:z.string().trim().toUpperCase().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/).optional(),
  gstEnrolmentId:z.string().trim().toUpperCase().regex(/^[A-Z0-9]{15}$/, "Enter the 15-character GST Enrolment ID").optional(),
  taxDeclarationAccepted:z.literal(true),
  password:z.string().min(8).max(256)
}).superRefine((value, ctx) => {
  if (value.taxIdentityType === "GSTIN" && !value.gstin) {
    ctx.addIssue({ code:"custom", path:["gstin"], message:"GSTIN is required when GST registration is selected" });
  }
  if (value.taxIdentityType === "ENROLMENT_ID" && !value.gstEnrolmentId) {
    ctx.addIssue({ code:"custom", path:["gstEnrolmentId"], message:"GST Enrolment ID is required for this route" });
  }
  if (value.taxIdentityType === "ENROLMENT_ID" && value.gstin) {
    ctx.addIssue({ code:"custom", path:["gstin"], message:"Do not enter GSTIN when using the Enrolment ID route" });
  }
});
export const kycDocumentSchema = z.object({ type:z.enum(["GST","GST_ENROLMENT","PAN","BANK_PROOF","ADDRESS_PROOF","IDENTITY"]), mediaAssetId:uuidSchema });
export const sellerKycSubmissionSchema = z.object({ documents:z.array(kycDocumentSchema).min(1).max(5).refine((documents)=>new Set(documents.map((document)=>document.type)).size===documents.length,"Each KYC document type may only be submitted once") });
export const sellerApprovalSchema = z.object({ sellerId:uuidSchema, decision:z.enum(["APPROVED","REJECTED"]), notes:z.string().trim().max(2000).optional() });
export const productDraftSchema = z.object({ title:z.string().trim().min(3).max(200), description:z.string().trim().max(20000).optional(), categoryId:uuidSchema, imageAssetIds:z.array(uuidSchema).min(1).max(PRODUCT_MEDIA_LIMITS.maxImages).refine((ids)=>new Set(ids).size===ids.length,"Duplicate image assets are not allowed"), videoAssetId:uuidSchema.optional() });
export const qcSubmissionSchema = z.object({ productId:uuidSchema, notes:z.string().trim().max(2000).optional() });
export const qcDecisionSchema = z.object({ qcSubmissionId:uuidSchema, decision:z.enum(["APPROVED","REJECTED"]), notes:z.string().trim().max(2000).optional() });
export const inventoryAdjustSchema = z.object({ variantId:uuidSchema, onHand:z.number().int().nonnegative() });
export const themeSectionSchema = z.object({ type:z.string().min(1).max(80), position:z.number().int().min(0), isVisible:z.boolean().default(true), settings:z.record(z.unknown()) });
export const saveHomepageSchema = z.object({ sections:z.array(themeSectionSchema).max(30), themeSettings:z.record(z.unknown()).default({}) });
export const publishThemeSchema = z.object({ themeId:uuidSchema, message:z.string().max(280).optional() });

const couponBaseSchema = z.object({
  code:z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,32}$/),
  title:z.string().trim().min(2).max(120),
  description:z.string().trim().max(500).optional(),
  discountType:z.enum(["PERCENTAGE","FIXED","FREE_SHIPPING"]),
  discountValue:z.number().int().min(0).max(10000).default(0),
  minimumOrderPaise:z.number().int().min(0).default(0),
  maximumDiscountPaise:z.number().int().positive().optional(),
  startsAt:z.string().datetime(),
  endsAt:z.string().datetime().optional(),
  usageLimit:z.number().int().positive().optional(),
  perCustomerLimit:z.number().int().positive().max(100).default(1),
  firstOrderOnly:z.boolean().default(false),
  stackable:z.boolean().default(false),
  fundingType:z.enum(["AZADIMART","SELLER"]).default("AZADIMART"),
  sellerId:uuidSchema.optional(),
  scope:z.object({
    productIds:z.array(uuidSchema).max(100).default([]),
    categoryIds:z.array(uuidSchema).max(100).default([]),
    sellerIds:z.array(uuidSchema).max(100).default([]),
  }).default({productIds:[],categoryIds:[],sellerIds:[]}),
  isActive:z.boolean().default(true),
});

type CouponPayload = z.infer<typeof couponBaseSchema>;

function validateCouponRules(value: Partial<CouponPayload>, ctx: z.RefinementCtx) {
  if (value.discountType === "PERCENTAGE" && value.discountValue !== undefined && value.discountValue > 100) {
    ctx.addIssue({
      code: "custom",
      path: ["discountValue"],
      message: "Percentage discount cannot exceed 100",
    });
  }
  if (value.startsAt && value.endsAt && new Date(value.endsAt) <= new Date(value.startsAt)) {
    ctx.addIssue({
      code: "custom",
      path: ["endsAt"],
      message: "End date must be after start date",
    });
  }
  if (value.fundingType === "SELLER" && !value.sellerId) {
    ctx.addIssue({
      code: "custom",
      path: ["sellerId"],
      message: "Seller is required for seller-funded coupons",
    });
  }
}

export const couponSchema = couponBaseSchema.superRefine(validateCouponRules);
export const couponUpdateSchema = couponBaseSchema.partial().superRefine(validateCouponRules);
export const navigationItemSchema = z.object({
  label: z.string().trim().min(1).max(80),
  href: z.string().trim().regex(/^\//, "Navigation links must use an internal path"),
  isActive: z.boolean().default(true),
});

export const navigationSchema = z.object({
  items: z.array(navigationItemSchema).max(20),
});

export const couponValidationSchema = z.object({
  cartId: uuidSchema,
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,32}$/),
});

export const loginSchema = z.object({ email:z.string().trim().email().max(254).transform((value)=>value.toLowerCase()), password:z.string().min(8).max(256) });
export const roleSchema = z.enum(ROLES);