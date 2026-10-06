const EDITOR_FLOW = [
  "Theme",
  "Sections",
  "Add section",
  "Remove section",
  "Reorder sections",
  "Edit section",
  "Upload image/video",
  "Preview",
  "Save draft",
  "Publish",
  "Revision history",
  "Rollback",
];

export default function OnlineStorePage() {
  return (
    <main className="px-8 py-10">
      <h1 className="text-3xl font-semibold">Online Store</h1>
      <p className="mt-2 max-w-2xl text-ink-muted">
        Visual editor for homepage and storefront content. Changes persist as draft page_sections and
        theme_revisions. Publishing does not require a code deploy.
      </p>
      <ol className="mt-8 list-decimal space-y-1 pl-5 text-ink-muted">
        {EDITOR_FLOW.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </main>
  );
}
