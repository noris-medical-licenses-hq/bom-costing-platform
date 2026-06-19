-- M-041: Trace Linkage — Row-Level Import Provenance
--
-- Context: The Trace-to-Source architecture requires that every resolved cost
-- can navigate all the way to the exact CSV row that originated it.
--
-- Before M-041:
--   purchase_history       → import_jobs (file level only)
--   price_list_version_items → (no import linkage at all — parent version has import_job_id)
--
-- After M-041:
--   purchase_history.import_job_row_id → import_job_rows (exact committed row)
--   price_list_version_items.import_job_row_id → import_job_rows (exact committed row)
--
-- Existing rows keep import_job_row_id = NULL (acceptable — historical data
-- pre-dates this column). New imports set this field in the commit handler.
--
-- This closes the last-mile gap: PRICE_LIST and LAST_PURCHASE strategies can now
-- navigate → cost build line → source record → import_job_row → raw_data (CSV).

ALTER TABLE purchase_history
  ADD COLUMN IF NOT EXISTS import_job_row_id uuid NULL
  REFERENCES import_job_rows(id);

ALTER TABLE price_list_version_items
  ADD COLUMN IF NOT EXISTS import_job_row_id uuid NULL
  REFERENCES import_job_rows(id);

CREATE INDEX IF NOT EXISTS purchase_history_import_row_idx
  ON purchase_history(import_job_row_id)
  WHERE import_job_row_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS price_list_items_import_row_idx
  ON price_list_version_items(import_job_row_id)
  WHERE import_job_row_id IS NOT NULL;

COMMENT ON COLUMN purchase_history.import_job_row_id IS
  'FK to the exact import_job_rows row that created this record. NULL for pre-M-041 data.';

COMMENT ON COLUMN price_list_version_items.import_job_row_id IS
  'FK to the exact import_job_rows row that created this price item. NULL for pre-M-041 data.';
