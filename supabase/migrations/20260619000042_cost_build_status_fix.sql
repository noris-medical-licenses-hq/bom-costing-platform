-- M-042: Restore approved + locked to site_cost_builds.status constraint
--
-- Root cause: M-038 (mfg_cost_structures) replaced the site_cost_builds_status_check
-- constraint to add 'complete_with_warnings' but accidentally dropped 'approved' and
-- 'locked', which were introduced by M-032 (country_price_lists).
--
-- Result: any call to POST /api/cost-builds/[id]/approve or /lock raises a CHECK
-- constraint violation at the database level — the governance workflow is broken
-- for any org that applied M-038.
--
-- Fix: replace the constraint with the full set of valid status values.
-- Idempotent (DROP IF EXISTS before ADD).

ALTER TABLE site_cost_builds DROP CONSTRAINT IF EXISTS site_cost_builds_status_check;

ALTER TABLE site_cost_builds ADD CONSTRAINT site_cost_builds_status_check
  CHECK (status IN (
    'draft',
    'running',
    'complete',
    'complete_with_warnings',
    'approved',
    'locked',
    'failed',
    'archived'
  ));
