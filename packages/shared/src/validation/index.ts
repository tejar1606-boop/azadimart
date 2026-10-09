import { z } from "zod";
import { ROLES } from "../roles";
import { PRODUCT_MEDIA_LIMITS } from "../routes";

export const uuidSchema = z.string().uuid();
export const paginationSchema = z.object({ page:z.coerce.number().int().min(1).default(1), pageSize:z.coerce.number().int().min(1).max(100).default(20) });
export const moneySchema = z.object({ amountPaise:z.number().int().nonnegative(), currency:z.literal("INR").default("INR") });

export const sellerRegistrationSchema = z.object({
  storeName:z.string().trim().min(2).max(120), legalName:z.string().trim().min(2).max(160), email:z.string().trim().email().max(254).transform((value)=>value.toLowerCase()),
  phone:z.string().regex(/^[6-9]\d{9}$/, "Enter a valid Indian mobile number"),
  businessState:z.string().trim().min(2).max(80),
  taxIdentityType:z.enum(["GSTIN","ENROLMENT_ID"]),
  gstin:z.string().trim().toUpperCase().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/).optional(),
  gstEnrolmentId:z.string().trim().toUpperCase().regex(/^[A-Z0-9]{15}$/, "Enter the 15-character GST Enrolment ID").optional(),
  taxDeclarationAccepted:z.literal(true),
  password:z.string().min(8).max(256),
  captchaToken:z.string().max(2048).optional(),
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
export const sellerShippingSettingsSchema = z.object({
  preferredProvider: z.enum(["MANUAL","SHIPROCKET","DELHIVERY","SHADOWFAX"]).default("MANUAL"),
  pickup: z.object({
    name: z.string().trim().min(2).max(120),
    phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid Indian mobile number"),
    line1: z.string().trim().min(3).max(160),
    line2: z.string().trim().max(160).optional(),
    city: z.string().trim().min(2).max(80),
    state: z.string().trim().min(2).max(80),
    postalCode: z.string().regex(/^[1-9][0-9]{5}$/, "Enter a valid 6-digit PIN code"),
    country: z.literal("IN").default("IN"),
  }),
});

/** Specification table rows (label/value, plain text). Up to 40 rows. */
export const specRowsSchema = z.array(z.object({
  label: z.string().trim().min(1, "Every row needs a label").max(60, "Keep labels under 60 characters"),
  value: z.string().trim().min(1, "Every row needs a value").max(500, "Keep each value under 500 characters"),
})).max(40, "Add up to 40 specification rows").default([]);
export const productDraftSchema = z.object({
  title:z.string().trim().min(3).max(200),
  description:z.string().trim().max(20000).optional(),
  specifications:specRowsSchema.optional(),
  categoryId:uuidSchema,
  imageAssetIds:z.array(uuidSchema).min(1).max(PRODUCT_MEDIA_LIMITS.maxImages).refine((ids)=>new Set(ids).size===ids.length,"Duplicate image assets are not allowed"),
  videoAssetId:uuidSchema.optional(),
  variant:z.object({
    sku:z.string().trim().min(3).max(64),
    title:z.string().trim().min(1).max(120).default("Default"),
    pricePaise:z.number().int().nonnegative(),
    compareAtPaise:z.number().int().nonnegative().optional(),
    // Couriers need a package weight to create shipments.
    weightGrams:z.number().int().positive("Enter the package weight in grams").max(1000000),
    onHand:z.number().int().nonnegative().default(0),
  }).optional(),
});
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
  // PERCENTAGE: 1-100 (checked below). FIXED: paise, up to ₹1,00,000.
  discountValue:z.number().int().min(0).max(10_000_000).default(0),
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
  // "/path" only: "//host" is a protocol-relative external link.
  href: z.string().trim().regex(/^\/(?![/\\])/, "Navigation links must use an internal path"),
  isActive: z.boolean().default(true),
});

export const navigationSchema = z.object({
  items: z.array(navigationItemSchema).max(20),
});

export const couponValidationSchema = z.object({
  cartId: uuidSchema,
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,32}$/),
});
export const cartItemMutationSchema = z.object({
  variantId: uuidSchema,
  quantity: z.number().int().min(1).max(99),
});
export const cartRemoveSchema = z.object({ variantId: uuidSchema });
export const addressSchema = z.object({
  label:z.string().trim().max(40).optional(),
  line1:z.string().trim().min(3).max(160),
  line2:z.string().trim().max(160).optional(),
  city:z.string().trim().min(2).max(80),
  state:z.string().trim().min(2).max(80),
  postalCode:z.string().regex(/^[1-9][0-9]{5}$/,"Enter a valid 6-digit PIN code"),
  country:z.literal("IN").default("IN"),
  isDefault:z.boolean().default(false),
});
export const checkoutSchema = z.object({
  shippingAddressId: uuidSchema,
  couponCode:z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,32}$/).optional(),
  paymentMethod:z.enum(["COD","RAZORPAY","CASHFREE"]).default("COD"),
});
export const orderStatusUpdateSchema = z.object({
  status:z.enum(["PAID","CONFIRMED","PACKED","CANCELLED"]),
  notes:z.string().trim().max(500).optional(),
});
export const shipmentStatusUpdateSchema = z.object({
  status:z.enum(["PICKED_UP","IN_TRANSIT","OUT_FOR_DELIVERY","DELIVERED","FAILED","RETURNED","CANCELLED"]),
  notes:z.string().trim().max(500).optional(),
});

export const loginSchema = z.object({ email:z.string().trim().email().max(254).transform((value)=>value.toLowerCase()), password:z.string().min(8).max(256), captchaToken:z.string().max(2048).optional() });
export const customerRegistrationSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254).transform((value)=>value.toLowerCase()),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid Indian mobile number"),
  password: z.string().min(8).max(256),
  captchaToken: z.string().max(2048).optional(),
});
export const roleSchema = z.enum(ROLES);export const mediaUploadRequestSchema = z.object({
  purpose: z.enum(["SITE_IMAGE", "SITE_VIDEO", "PRODUCT_IMAGE", "PRODUCT_VIDEO", "APLUS_IMAGE", "REVIEW_IMAGE"]),
  contentType: z.string().max(100),
  byteSize: z.number().int().positive(),
  /** Admin product uploads: the product whose seller folder receives the file. */
  productId: uuidSchema.optional(),
});
export const mediaUploadCompleteSchema = z.object({ token: z.string().min(10).max(4000), altText: z.string().max(300).optional() });
/** Admin manual product edit: details, variants (price, MRP, stock, weight) and media. */
export const adminProductUpdateSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(20000).optional().default(""),
  specifications: specRowsSchema.optional(),
  categoryId: uuidSchema,
  variants: z.array(z.object({
    id: uuidSchema,
    title: z.string().trim().min(1).max(120),
    sku: z.string().trim().min(3).max(64),
    pricePaise: z.number().int().positive("Price must be above ₹0"),
    compareAtPaise: z.number().int().positive().nullable().optional(),
    weightGrams: z.number().int().positive("Enter the package weight in grams").max(1000000),
    onHand: z.number().int().nonnegative().max(1000000),
    isActive: z.boolean(),
  }).refine((v) => !v.compareAtPaise || v.compareAtPaise >= v.pricePaise, { message: "MRP can't be lower than the price", path: ["compareAtPaise"] })).min(1).max(50),
  imageAssetIds: z.array(uuidSchema).min(1, "Keep at least one product image").max(PRODUCT_MEDIA_LIMITS.maxImages).refine((ids) => new Set(ids).size === ids.length, "Duplicate images"),
  videoAssetId: uuidSchema.nullable().optional(),
  // SEO overrides (empty = generated automatically from the product).
  metaTitle: z.string().trim().max(70, "Keep the search title under 70 characters").optional().default(""),
  metaDescription: z.string().trim().max(170, "Keep the search description under 170 characters").optional().default(""),
});
export const adminProductStatusSchema = z.object({ action: z.enum(["hide", "show", "archive", "restore"]), reason: z.string().trim().max(500).optional() });

const categoryName = z.string().trim().min(2, "Category name needs at least 2 characters").max(60);
export const adminCategoryCreateSchema = z.object({ name: categoryName, parentId: uuidSchema.nullable().optional() });
export const adminCategoryUpdateSchema = z.object({
  name: categoryName.optional(),
  isActive: z.boolean().optional(),
  parentId: uuidSchema.nullable().optional(),
  // SEO: search title/description and the intro shown on the category page ("" clears).
  metaTitle: z.string().trim().max(70, "Keep the search title under 70 characters").optional(),
  metaDescription: z.string().trim().max(170, "Keep the search description under 170 characters").optional(),
  description: z.string().trim().max(3000).optional(),
}).refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to update");
/** Sibling categories in their new order. */
export const adminCategoryOrderSchema = z.object({ ids: z.array(uuidSchema).min(1).max(500).refine((ids) => new Set(ids).size === ids.length, "Duplicate categories") });
/** Live products in their new storefront order (all of them, or one category's). */
export const adminProductArrangeSchema = z.object({
  categoryId: uuidSchema.nullable().optional(),
  productIds: z.array(uuidSchema).min(1).max(2000).refine((ids) => new Set(ids).size === ids.length, "Duplicate products"),
});
/** Move products (e.g. listed by a seller in the wrong place) to another category. */
export const adminMoveCategorySchema = z.object({
  categoryId: uuidSchema,
  productIds: z.array(uuidSchema).min(1).max(500).refine((ids) => new Set(ids).size === ids.length, "Duplicate products"),
});

// Reviews: links are not allowed (spam), text is optional but bounded.
const NO_LINKS = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|in|net|org|xyz|shop|link|io|co)\b)/i;
const reviewText = (max: number) => z.string().trim().max(max).optional().default("").refine((v) => !NO_LINKS.test(v), "Please remove web links from your review");
export const reviewSubmitSchema = z.object({
  productId: uuidSchema,
  rating: z.number().int().min(1, "Choose a star rating").max(5),
  title: reviewText(100),
  body: reviewText(2000),
  mediaAssetIds: z.array(uuidSchema).max(4, "Add up to 4 photos").default([]).refine((ids) => new Set(ids).size === ids.length, "Duplicate photos"),
});
export const adminReviewModerationSchema = z.object({
  status: z.enum(["PUBLISHED", "HIDDEN"]),
  reason: z.string().trim().max(300).optional(),
});
/** Seller's public reply to a review ("" removes it). */
export const sellerReviewReplySchema = z.object({
  reply: z.string().trim().max(1000).refine((v) => !NO_LINKS.test(v), "Please remove web links from your reply"),
});

/** Offer tags (admin): short label, colour, who it applies to and when. */
export const OFFER_TAG_TONES = ["SAFFRON", "GREEN", "RED", "NAVY", "PINK", "PURPLE"] as const;
/** How long a "Price drop" tag stays on a product after its price is lowered. */
export const PRICE_DROP_TAG_DAYS = 7;
export const offerTagSchema = z.object({
  label: z.string().trim().min(2, "Tag text needs at least 2 characters").max(24, "Keep the tag under 24 characters"),
  tone: z.enum(OFFER_TAG_TONES).default("SAFFRON"),
  scope: z.object({
    allProducts: z.boolean().optional().default(false),
    categoryIds: z.array(uuidSchema).max(100).optional().default([]),
    productIds: z.array(uuidSchema).max(500).optional().default([]),
  }).refine((s) => s.allProducts || s.categoryIds.length > 0 || s.productIds.length > 0, "Choose which products get this tag"),
  startsAt: z.string().datetime({ offset: true }).optional(),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
  priority: z.number().int().min(0).max(100).optional().default(0),
  isActive: z.boolean().optional().default(true),
}).refine((v) => !v.endsAt || !v.startsAt || new Date(v.endsAt) > new Date(v.startsAt), { message: "The end date must be after the start", path: ["endsAt"] });
/** Admin records a manual abandoned-cart reminder. */
export const cartReminderSchema = z.object({ channel: z.enum(["WHATSAPP", "EMAIL"]), couponCode: z.string().trim().max(32).optional() });

// ── Order fulfilment rules (Amazon/Flipkart-style) ───────────────────────────
/** Days a seller has to ship (create the shipment) after an order is placed. */
export const SHIP_BY_DAYS = 2;
/** Unshipped orders are cancelled automatically this many days after ordering. */
export const AUTO_CANCEL_DAYS = 5;
/** Sellers are warned above this cancellation rate (share of their orders, last 90 days). */
export const CANCELLATION_RATE_WARNING = 0.05;
/** Sellers are warned above this late-dispatch rate. */
export const LATE_DISPATCH_RATE_WARNING = 0.04;
export const SELLER_CANCEL_REASONS = ["Out of stock", "Product damaged or defective", "Can't ship to this address", "Price or listing error", "Other"] as const;
export const sellerCancelSchema = z.object({
  reason: z.enum(SELLER_CANCEL_REASONS),
  note: z.string().trim().max(300).optional(),
});
export const sellerAlertSettingsSchema = z.object({ newOrders: z.boolean(), reminders: z.boolean(), cancellations: z.boolean() });
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(1000).refine((u) => u.startsWith("https://"), "Push endpoint must be https"),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});

// Aadhaar: 12 digits, never starting with 0 or 1, ending in a Verhoeff check digit (UIDAI's scheme).
const VERHOEFF_D = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
const VERHOEFF_P = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
export function isValidAadhaar(value: string): boolean {
  if (!/^[2-9]\d{11}$/.test(value)) return false;
  let c = 0;
  [...value].reverse().forEach((digit, i) => { c = VERHOEFF_D[c]![VERHOEFF_P[i % 8]![Number(digit)]!]!; });
  return c === 0;
}
export const maskAadhaar = (last4: string) => `XXXX XXXX ${last4}`;
export const aadhaarOtpRequestSchema = z.object({
  aadhaarNumber: z.string().transform((v) => v.replace(/[\s-]/g, "")).refine(isValidAadhaar, "Enter a valid 12-digit Aadhaar number"),
  consent: z.literal(true, { errorMap: () => ({ message: "Please give consent to verify your Aadhaar" }) }),
});
export const aadhaarOtpVerifySchema = z.object({ otp: z.string().regex(/^\d{6}$/, "Enter the 6-digit OTP") });
