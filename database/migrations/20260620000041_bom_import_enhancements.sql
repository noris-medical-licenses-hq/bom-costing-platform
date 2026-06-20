-- M-041: BOM Import Enhancements
--
-- Enables three UAT-blocking features:
--   1. Auto-creation of missing SKUs during BOM import (auto_created, created_source,
--      original_import_job_id).
--   2. classification_status separates "we know the sourcing strategy" from
--      "we don't know — please review". make_buy stays a pure business field
--      (make | buy | make_or_buy) and is now nullable so that unknown-prefix
--      auto-created SKUs can carry NULL until a human classifies them.
--   3. No new tables, no RLS changes, no API routes.
--
-- MVP Limitation (documented):
--   Auto-created SKUs are committed immediately to the SKU master before BOM
--   lines are inserted. If the subsequent BOM line commit fails, the auto-created
--   SKU remains in the master (marked auto_created = true). It is visible,
--   auditable, and manually cleanable. Transaction-level compensation is deferred
--   to a future phase.

-- ── 1. Allow make_buy to be NULL ─────────────────────────────────────────────
-- NULL means "classification not yet determined" for auto-created SKUs whose
-- part-number prefix is not recognised. The existing CHECK constraint accepts
-- NULL without modification (PostgreSQL CHECK treats NULL input as passing).
ALTER TABLE skus ALTER COLUMN make_buy DROP NOT NULL;

-- ── 2. classification_status ──────────────────────────────────────────────────
-- 'classified'   → make_buy is populated and trusted.
-- 'needs_review' → make_buy is NULL; a user must supply the correct value.
-- All existing rows default to 'classified' (they already have make_buy set).
ALTER TABLE skus
  ADD COLUMN IF NOT EXISTS classification_status text NOT NULL DEFAULT 'classified'
  CONSTRAINT skus_classification_status_check
    CHECK (classification_status IN ('classified', 'needs_review'));

-- ── 3. auto_created flag ──────────────────────────────────────────────────────
ALTER TABLE skus
  ADD COLUMN IF NOT EXISTS auto_created boolean NOT NULL DEFAULT false;

-- ── 4. created_source ─────────────────────────────────────────────────────────
ALTER TABLE skus
  ADD COLUMN IF NOT EXISTS created_source text NOT NULL DEFAULT 'MANUAL'
  CONSTRAINT skus_created_source_check
    CHECK (created_source IN ('MANUAL', 'BOM_IMPORT', 'OTHER_IMPORT'));

-- ── 5. original_import_job_id ─────────────────────────────────────────────────
-- FK to import_jobs; SET NULL on job deletion so historical SKUs are not lost.
ALTER TABLE skus
  ADD COLUMN IF NOT EXISTS original_import_job_id uuid
  REFERENCES import_jobs(id) ON DELETE SET NULL;

COMMENT ON COLUMN skus.classification_status IS
  'needs_review when make_buy is NULL (auto-created SKU with unknown prefix). User must supply value.';
COMMENT ON COLUMN skus.auto_created IS
  'true when this SKU was created as a side-effect of a BOM import, not via SKU Master.';
COMMENT ON COLUMN skus.created_source IS
  'Which import flow created this record: MANUAL | BOM_IMPORT | OTHER_IMPORT.';
COMMENT ON COLUMN skus.original_import_job_id IS
  'Import job that auto-created this SKU. NULL for manually-created SKUs.';
