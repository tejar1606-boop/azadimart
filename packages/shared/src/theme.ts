export const SECTION_TYPES = [
  "hero",
  "marquee",
  "promo_banner",
  "featured_products",
  "category_grid",
  "trust_strip",
  "rich_text",
  "image_banner",
  "video",
  "sales_coupons",
  "seller_cta",
  "newsletter",
] as const;

export type SectionType = (typeof SECTION_TYPES)[number];

export type ThemeSectionDraft = {
  id?: string;
  type: SectionType | string;
  position: number;
  isVisible: boolean;
  settings: Record<string, unknown>;
};

export type ThemeEditorCommand =
  | { type: "ADD_SECTION"; sectionType: string; position: number }
  | { type: "REMOVE_SECTION"; sectionId: string }
  | { type: "REORDER_SECTIONS"; orderedIds: string[] }
  | { type: "EDIT_SECTION"; sectionId: string; settings: Record<string, unknown> }
  | { type: "UPLOAD_MEDIA"; sectionId: string; field: string; mediaAssetId: string }
  | { type: "SAVE_DRAFT" }
  | { type: "PUBLISH"; message?: string }
  | { type: "ROLLBACK"; revisionId: string };

export function applySectionReorder<T extends { id: string }>(
  sections: T[],
  orderedIds: string[],
): T[] {
  const byId = new Map(sections.map((section) => [section.id, section]));
  return orderedIds
    .map((id) => byId.get(id))
    .filter((section): section is T => Boolean(section));
}

export const DEFAULT_HOME_SECTIONS: ThemeSectionDraft[] = [
  {
    type: "hero",
    position: 0,
    isVisible: true,
    settings: {
      eyebrow: "Made for India",
      heading: "Everything India. One trusted marketplace.",
      description:
        "Discover products from verified sellers across farming, travel, fashion, home and beauty.",
      primaryLabel: "Shop now",
      primaryHref: "/products",
      secondaryLabel: "Become a seller",
      secondaryHref: "/seller",
      desktopImageUrl: "",
      mobileImageUrl: "",
      badge: "Verified sellers • Secure checkout",
    },
  },
  {
    type: "category_grid",
    position: 1,
    isVisible: true,
    settings: {
      heading: "Shop by category",
      subtitle: "Built around everyday India",
      categories: [
        "Farming",
        "Hotels & stays",
        "Made in India clothing",
        "Home & kitchen",
        "Beauty",
      ],
    },
  },
  {
    type: "trust_strip",
    position: 2,
    isVisible: true,
    settings: {
      items: [
        "Verified sellers",
        "Quality-controlled catalog",
        "Secure payments",
        "Responsive support",
      ],
    },
  },
  {
    type: "featured_products",
    position: 3,
    isVisible: true,
    settings: {
      heading: "Featured on AzadiMart",
      subtitle: "Handpicked products from active sellers",
      limit: 8,
      sort: "newest",
    },
  },
  {
    type: "sales_coupons",
    position: 4,
    isVisible: true,
    settings: {
      heading: "Save more with AzadiMart coupons",
      subtitle: "Copy a code and apply it at checkout.",
      limit: 4,
    },
  },
  {
    type: "image_banner",
    position: 5,
    isVisible: true,
    settings: {
      eyebrow: "Proudly Indian",
      heading: "Support Indian sellers. Grow local.",
      description:
        "A marketplace designed to give trustworthy Indian businesses a digital storefront.",
      imageUrl: "",
      buttonLabel: "Explore collections",
      buttonHref: "/products",
    },
  },
  {
    type: "seller_cta",
    position: 6,
    isVisible: true,
    settings: {
      eyebrow: "Built for ambitious sellers",
      heading: "Take your business online with AzadiMart.",
      description:
        "A professional storefront, catalog tools, QC workflow and marketplace reach in one place.",
      primaryLabel: "Start selling",
      primaryHref: "/seller",
      secondaryLabel: "Learn more",
      secondaryHref: "/seller",
    },
  },
  {
    type: "newsletter",
    position: 7,
    isVisible: true,
    settings: {
      heading: "Stay in the loop",
      description:
        "Get early access to new collections and major offers.",
      buttonLabel: "Notify me",
    },
  },
];