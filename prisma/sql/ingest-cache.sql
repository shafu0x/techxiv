-- Additive setup, before deploying code that uses IngestCache.
-- This project uses db:push rather than an established migration history.
CREATE TABLE IF NOT EXISTS "IngestCache" (
  "key" TEXT PRIMARY KEY,
  "etag" TEXT,
  "lastModified" TEXT,
  "contentHash" TEXT,
  "payload" TEXT NOT NULL,
  "failures" INTEGER NOT NULL DEFAULT 0,
  "retryAt" TIMESTAMP(3)
);
