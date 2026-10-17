CREATE UNIQUE INDEX IF NOT EXISTS themes_published_unique
  ON "themes" ("status")
  WHERE "status" = 'PUBLISHED';
