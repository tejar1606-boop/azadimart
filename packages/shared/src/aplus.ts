import { z } from "zod";

/**
 * A+ content: rich product-page modules a seller builds and AzadiMart reviews
 * before they appear on the storefront. Blocks are structured data only (text
 * and media URLs) — never HTML — so they cannot inject markup or scripts.
 */

export const APLUS_MAX_BLOCKS = 7;

/** Required pixel sizes; images must match the shape (±2%). */
export const APLUS_IMAGE_SIZES = {
  bannerDesktop: { width: 1464, height: 600 },
  bannerMobile: { width: 600, height: 450 },
  square: { width: 1000, height: 1000 },
} as const;

// Media must be the seller's own uploads, served from /media/product-media/<sellerId>/…
const mediaUrl = z.string().trim().max(300).regex(/^\/media\/product-media\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|mp4|webm|mov)$/, "Upload media in the editor");
const optionalMediaUrl = z.union([mediaUrl, z.literal("")]).optional().transform((value) => value || undefined);
const text = (max: number) => z.string().trim().max(max);

const bannerBlock = z.object({
  type: z.literal("banner"),
  desktopImageUrl: optionalMediaUrl,
  mobileImageUrl: optionalMediaUrl,
  desktopVideoUrl: optionalMediaUrl,
  mobileVideoUrl: optionalMediaUrl,
  alt: text(160).default(""),
}).refine((block) => block.desktopImageUrl || block.desktopVideoUrl, { message: "Banner needs a desktop image or video", path: ["desktopImageUrl"] });

const imageTextBlock = z.object({
  type: z.literal("image_text"),
  imageUrl: optionalMediaUrl, // image is optional: text-only is allowed
  imagePosition: z.enum(["left", "right"]).default("left"),
  heading: text(120).min(1, "Add a heading"),
  body: text(1500).default(""),
});

const featuresBlock = z.object({
  type: z.literal("features"),
  heading: text(120).default(""),
  items: z.array(z.object({
    imageUrl: optionalMediaUrl,
    title: text(80).min(1, "Add a title for each feature"),
    text: text(300).default(""),
  })).min(1).max(3),
});

const comparisonBlock = z.object({
  type: z.literal("comparison"),
  heading: text(120).default("Compare similar products"),
  /** Other products from the same seller (this product is always the first column). */
  productIds: z.array(z.string().uuid()).min(1, "Choose at least one product to compare").max(3),
  rows: z.array(z.object({
    label: text(60).min(1, "Add a row label"),
    /** One value per column: this product first, then productIds in order. */
    values: z.array(text(80)).max(4),
  })).min(1).max(10),
});

const textBlock = z.object({
  type: z.literal("text"),
  heading: text(120).default(""),
  body: text(3000).min(1, "Add some text"),
});

/** Each block is validated with the schema for its type (the banner rule is a refinement, so no discriminated union). */
const blockByType = { banner: bannerBlock, image_text: imageTextBlock, features: featuresBlock, comparison: comparisonBlock, text: textBlock } as const;
export const aplusBlocksSchema = z.array(z.record(z.unknown())).max(APLUS_MAX_BLOCKS, `Up to ${APLUS_MAX_BLOCKS} blocks`).transform((blocks, ctx) => {
  return blocks.map((block, index) => {
    const schema = blockByType[block.type as keyof typeof blockByType];
    if (!schema) {
      ctx.addIssue({ code: "custom", path: [index, "type"], message: "Unknown block type" });
      return z.NEVER;
    }
    const parsed = (schema as z.ZodTypeAny).safeParse(block);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) ctx.addIssue({ ...issue, path: [index, ...issue.path] });
      return z.NEVER;
    }
    return parsed.data as AplusBlock;
  });
});

export type AplusBlock =
  | z.infer<typeof bannerBlock>
  | z.infer<typeof imageTextBlock>
  | z.infer<typeof featuresBlock>
  | z.infer<typeof comparisonBlock>
  | z.infer<typeof textBlock>;

export const aplusSaveSchema = z.object({ blocks: aplusBlocksSchema });
export const aplusDecisionSchema = z.object({ decision: z.enum(["APPROVED", "REJECTED"]), notes: z.string().trim().max(1000).optional() });

/** Every media URL referenced by a set of blocks (for ownership checks). */
export function aplusMediaUrls(blocks: AplusBlock[]): string[] {
  const urls: Array<string | undefined> = [];
  for (const block of blocks) {
    if (block.type === "banner") urls.push(block.desktopImageUrl, block.mobileImageUrl, block.desktopVideoUrl, block.mobileVideoUrl);
    if (block.type === "image_text") urls.push(block.imageUrl);
    if (block.type === "features") urls.push(...block.items.map((item) => item.imageUrl));
  }
  return urls.filter((url): url is string => Boolean(url));
}

/** Product ids referenced by comparison blocks. */
export function aplusComparedProductIds(blocks: AplusBlock[]): string[] {
  return [...new Set(blocks.flatMap((block) => (block.type === "comparison" ? block.productIds : [])))];
}
