-- M-043: Full Import Row Traceability (BG-017)
--
-- Extends row-level import provenance to the four remaining import types.
-- M-041 added import_job_row_id to purchase_history and price_list_version_items.
-- This migration adds the same column to skus, bom_lines, cost_items, and
-- inventory_lines, closing the traceability gap for all import-capable tables.
--
-- Design:
--   - Nullable FK — existing rows keep NULL (pre-BG-017 imports)
--   - Partial index on each column (only indexes non-NULL values, zero overhead
--     on tables with mostly manually-created records)
--   - No table rewrites; each statement is a fast ALTER TABLE ADD COLUMN
--   - For skus: upsert sets import_job_row_id to the latest importing row,
--     reflecting which import last wrote this SKU

ALTER TABLE skus
  ADD COLUMN IF NOT EXISTS import_job_row_id uuid NULL
  REFERENCES import_job_rows(id);

CREATE INDEX IF NOT EXISTS skus_import_job_row_idx
  ON skus(import_job_row_id)
  WHERE import_job_row_id IS NOT NULL;

COMMENT ON COLUMN skus.import_job_row_id IS
  'FK to the exact import_job_rows row that last created/updated this SKU. NULL for manually created or pre-BG-017 records.';

-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE bom_lines
  ADD COLUMN IF NOT EXISTS import_job_row_id uuid NULL
  REFERENCES import_job_rows(id);

CREATE INDEX IF NOT EXISTS bom_lines_import_job_row_idx
  ON bom_lines(import_job_row_id)
  WHERE import_job_row_id IS NOT NULL;

COMMENT ON COLUMN bom_lines.import_job_row_id IS
  'FK to the exact import_job_rows row that created this BOM line. NULL for manually created or pre-BG-017 lines.';

-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE cost_items
  ADD COLUMN IF NOT EXISTS import_job_row_id uuid NULL
  REFERENCES import_job_rows(id);

CREATE INDEX IF NOT EXISTS cost_items_import_job_row_idx
  ON cost_items(import_job_row_id)
  WHERE import_job_row_id IS NOT NULL;

COMMENT ON COLUMN cost_items.import_job_row_id IS
  'FK to the exact import_job_rows row that created this cost item. NULL for manually created or pre-BG-017 items.';

-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE inventory_lines
  ADD COLUMN IF NOT EXISTS import_job_row_id uuid NULL
  REFERENCES import_job_rows(id);

CREATE INDEX IF NOT EXISTS inventory_lines_import_job_row_idx
  ON inventory_lines(import_job_row_id)
  WHERE import_job_row_id IS NOT NULL;

COMMENT ON COLUMN inventory_lines.import_job_row_id IS
  'FK to the exact import_job_rows row that created this inventory line. NULL for manually created or pre-BG-017 lines.';
