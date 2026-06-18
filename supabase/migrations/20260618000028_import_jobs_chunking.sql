-- M-028: Import Jobs — chunked upload support
-- Adds processed_rows for progress tracking, extends status enum with 'uploading',
-- and adds a range-query index on import_job_rows for paginated commit.
-- No RLS changes. No new tables. Additive only.

-- ── Add processed_rows for real-time progress tracking ───────────────────────
ALTER TABLE import_jobs
  ADD COLUMN IF NOT EXISTS processed_rows int NOT NULL DEFAULT 0;

-- ── Extend status CHECK to include 'uploading' ───────────────────────────────
-- The constraint name matches the explicit name in M-024.
ALTER TABLE import_jobs
  DROP CONSTRAINT import_jobs_status_check;

ALTER TABLE import_jobs
  ADD CONSTRAINT import_jobs_status_check
  CHECK (status IN (
    'pending',
    'uploading',
    'validating',
    'validated',
    'committed',
    'failed',
    'cancelled'
  ));

-- ── Performance index for paginated chunk reads and commit ───────────────────
-- Covers: .eq('import_job_id', id).in('status', [...]).order('row_number').range(...)
CREATE INDEX IF NOT EXISTS import_job_rows_job_status_row_idx
  ON import_job_rows (import_job_id, status, row_number);
