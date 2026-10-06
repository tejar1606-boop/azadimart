import { z } from "zod";
import { ROLES } from "../roles";
import { PRODUCT_MEDIA_LIMITS } from "../routes";

export const uuidSchema = z.string().uuid();

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const moneySchema = z.object({
  amountPaise: z.number().int().nonnegative(),
  currency: z.literal("INR").default("INR"),
});

export const sellerRegistrationSchema = z.object({
  storeName: z.string().trim().min(2).max(120),
  legalName: z.string().trim().min(2).max(160),
  email: z.string().email(),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid Indian mobile number"),
  gstin: z
    .string()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/)
    .optional(),
  password: z.string().min(8).max(256),
});

export const sellerKycSubmissionSchema = z.object({
  documents: z
    .array(kycDocumentSchema)
    .min(1)
    .max(5)
    .refine(
      (documents) => new Set(documents.map((document) => document.type)).size === documents.length,
      "Each KYC document type may only be submitted once",
    ),
});

export const sellerApprovalSchema = z.object({
  sellerId: uuidSchema,
  decision: z.enum(["APPROVED", "REJECTED"]),
  notes: z.string().trim().max(2000).optional(),
});

export const kycDocumentSchema = z.object({
  type: z.enum(["GST", "PAN", "BANK_PROOF", "ADDRESS_PROOF", "IDENTITY"]),
  mediaAssetId: uuidSchema,
});

export const productDraftSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(20000).optional(),
  categoryId: uuidSchema,
  imageAssetIds: z
    .array(uuidSchema)
    .min(1)
    .max(PRODUCT_MEDIA_LIMITS.maxImages)
    .refine((ids) => new Set(ids).size === ids.length, "Duplicate image assets are not allowed"),
  videoAssetId: uuidSchema.optional(),
});

export const qcSubmissionSchema = z.object({
  productId: uuidSchema,
  notes: z.string().trim().max(2000).optional(),
});

export const qcDecisionSchema = z.object({
  qcSubmissionId: uuidSchema,
  decision: z.enum(["APPROVED", "REJECTED"]),
  notes: z.string().trim().max(2000).optional(),
});

export const inventoryAdjustSchema = z.object({
  variantId: uuidSchema,
  onHand: z.number().int().nonnegative(),
});

export const themeSectionSchema = z.object({
  type: z.string().min(1).max(80),
  position: z.number().int().min(0),
  isVisible: z.boolean().default(true),
  settings: z.record(z.unknown()),
});

export const publishThemeSchema = z.object({
  themeId: uuidSchema,
  message: z.string().max(280).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(256),
});

export const roleSchema = z.enum(ROLES);
