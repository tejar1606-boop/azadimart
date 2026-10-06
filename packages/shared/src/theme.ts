export const SECTION_TYPES = [
  "hero",
  "featured_products",
  "category_grid",
  "rich_text",
  "image_banner",
  "video",
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
