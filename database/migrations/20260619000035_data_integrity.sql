-- M-035: Sprint 2B Data Integrity
-- All changes are additive and idempotent (IF NOT EXISTS / IF EXISTS guards).
-- No data migration required; existing rows are compatible with all changes.

-- ─────────────────────────────────────────────────────────────────────────────
-- B-1: Enforce one active price list version per country_price_list
-- Without this, a failed import transaction can leave two 'active' versions,
-- causing the cost engine to resolve to an outdated price list silently.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS price_list_versions_one_active_per_list
  ON price_list_versions (price_list_id)
  WHERE status = 'active';

-- ─────────────────────────────────────────────────────────────────────────────
-- B-2: Fix site_cost_builds.approved_by / locked_by FK target
-- M-032 added these columns referencing auth.users(id) instead of profiles(id).
-- This is inconsistent with every other user-reference FK in the schema, and
-- prevents JOIN-based display of "Approved by" in the cost build detail view.
-- Since profiles.id = auth.users.id, all existing UUID values remain valid.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE site_cost_builds
  DROP CONSTRAINT IF EXISTS site_cost_builds_approved_by_fkey;
ALTER TABLE site_cost_builds
  DROP CONSTRAINT IF EXISTS site_cost_builds_locked_by_fkey;

ALTER TABLE site_cost_builds
  ADD CONSTRAINT site_cost_builds_approved_by_fkey
    FOREIGN KEY (approved_by) REFERENCES profiles(id);
ALTER TABLE site_cost_builds
  ADD CONSTRAINT site_cost_builds_locked_by_fkey
    FOREIGN KEY (locked_by) REFERENCES profiles(id);

-- ─────────────────────────────────────────────────────────────────────────────
-- B-3: Organization-id indexes for Phase 1 tables
-- M-023 created org indexes for all tables defined up to that migration.
-- Tables added in M-026, M-028, M-030, M-031, M-032 were not covered.
-- RLS policies use auth_org_id() in WHERE clauses; without an index these
-- become seq scans as data grows.
-- ─────────────────────────────────────────────────────────────────────────────

-- Phase 1 tables from M-026 (valuation context)
CREATE INDEX IF NOT EXISTS idx_valuation_reports_org
  ON valuation_reports (organization_id);
CREATE INDEX IF NOT EXISTS idx_vr_exchange_rates_report
  ON valuation_report_exchange_rates (report_id);
CREATE INDEX IF NOT EXISTS idx_vr_warehouse_filters_report
  ON valuation_report_warehouse_filters (report_id);
CREATE INDEX IF NOT EXISTS idx_vr_lines_report_missing
  ON valuation_report_lines (report_id, has_missing_cost);
CREATE INDEX IF NOT EXISTS idx_vr_lines_report_value
  ON valuation_report_lines (report_id, line_total_valuation_currency DESC);

-- Phase 1 tables from M-028 (import chunking)
CREATE INDEX IF NOT EXISTS idx_import_jobs_org
  ON import_jobs (organization_id);
CREATE INDEX IF NOT EXISTS idx_import_jobs_org_status
  ON import_jobs (organization_id, status, created_at DESC);

-- Phase 1 tables from M-030 (site cost builds) — M-030 adds org+site and status
-- indexes but not a simple org index; add it defensively
CREATE INDEX IF NOT EXISTS idx_site_cost_builds_org
  ON site_cost_builds (organization_id);
CREATE INDEX IF NOT EXISTS idx_site_cost_build_lines_org
  ON site_cost_build_lines (organization_id);
CREATE INDEX IF NOT EXISTS idx_sku_cost_overrides_org
  ON sku_cost_overrides (organization_id);

-- Phase 1 tables from M-032 (price lists) — M-032 adds composite indexes but
-- not plain org indexes for the RLS hot path
CREATE INDEX IF NOT EXISTS idx_price_list_versions_org
  ON price_list_versions (organization_id);
CREATE INDEX IF NOT EXISTS idx_price_list_version_items_org
  ON price_list_version_items (organization_id);

-- corporate_exchange_rates from M-026 — not covered by M-023
CREATE INDEX IF NOT EXISTS idx_corporate_exchange_rates_org
  ON corporate_exchange_rates (organization_id);
CREATE INDEX IF NOT EXISTS idx_corporate_exchange_rates_pair
  ON corporate_exchange_rates (organization_id, from_currency, to_currency, effective_date DESC);

-- import_templates from M-024
CREATE INDEX IF NOT EXISTS idx_import_templates_org
  ON import_templates (organization_id);
CREATE INDEX IF NOT EXISTS idx_import_template_mappings_template
  ON import_template_mappings (template_id);
