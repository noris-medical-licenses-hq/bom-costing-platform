-- ═══════════════════════════════════════════════════════════════════════════════
-- M-032: Country Price List Architecture + Cost Build Governance
--
-- Business rule: For non-Israel countries, price = country price (not site price).
-- All sites within a country share the same country price list.
-- Architecture: Country → Price List → Version → Items → Cost Build → Cost Set
--
-- Changes:
-- 1. New tables: country_price_lists, price_list_versions, price_list_version_items
-- 2. site_cost_builds: +price_list_version_id, +approve/lock columns, extended statuses
-- 3. cost_sets: +price_list_version_id
-- 4. sites.status: remove pending_delete / deleted — only active | archived allowed
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. country_price_lists ─────────────────────────────────────────────────────
-- Named price list per country. All sites in the same country inherit this list.

CREATE TABLE IF NOT EXISTS country_price_lists (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES organizations(id),
  country_code     text        NOT NULL,  -- ISO 3166-1 alpha-2 (DE, FR, IT…)
  name             text        NOT NULL,
  description      text,
  is_active        boolean     NOT NULL DEFAULT true,
  created_by       uuid        REFERENCES profiles(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT country_price_lists_country_check
    CHECK (char_length(country_code) = 2),
  CONSTRAINT country_price_lists_org_country_name_uidx
    UNIQUE (organization_id, country_code, name)
);

-- ── 2. price_list_versions ─────────────────────────────────────────────────────
-- One row per import. New import = new version. Never overwrite.

CREATE TABLE IF NOT EXISTS price_list_versions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid        NOT NULL REFERENCES organizations(id),
  price_list_id       uuid        NOT NULL REFERENCES country_price_lists(id) ON DELETE CASCADE,
  version_number      int         NOT NULL,
  effective_date      date        NOT NULL,
  imported_at         timestamptz NOT NULL DEFAULT now(),
  imported_by         uuid        REFERENCES profiles(id),
  currency            text        NOT NULL,
  status              text        NOT NULL DEFAULT 'active',
  item_count          int         NOT NULL DEFAULT 0,
  import_job_id       uuid,  -- FK to import_jobs added below (deferred to avoid ordering issue)
  quality_metrics     jsonb,
  notes               text,

  CONSTRAINT price_list_versions_status_check
    CHECK (status IN ('draft', 'active', 'superseded', 'archived')),
  CONSTRAINT price_list_versions_version_uidx
    UNIQUE (price_list_id, version_number)
);

-- ── 3. price_list_version_items ────────────────────────────────────────────────
-- One row per SKU per version. Immutable after creation.

CREATE TABLE IF NOT EXISTS price_list_version_items (
  id                    uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid           NOT NULL REFERENCES organizations(id),
  price_list_version_id uuid           NOT NULL REFERENCES price_list_versions(id) ON DELETE CASCADE,
  sku_id                uuid           REFERENCES skus(id),  -- nullable if part_number not found at import time
  part_number           text           NOT NULL,
  unit_price            numeric(18,6)  NOT NULL,
  currency              text           NOT NULL,
  notes                 text,
  created_at            timestamptz    NOT NULL DEFAULT now(),

  CONSTRAINT price_list_version_items_version_pn_uidx
    UNIQUE (price_list_version_id, part_number)
);

-- ── 4. Extend site_cost_builds ────────────────────────────────────────────────

ALTER TABLE site_cost_builds
  ADD COLUMN IF NOT EXISTS price_list_version_id uuid REFERENCES price_list_versions(id),
  ADD COLUMN IF NOT EXISTS approved_at  timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by  uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS locked_at    timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by    uuid REFERENCES auth.users(id);

-- Extend status enum to include governance statuses
ALTER TABLE site_cost_builds
  DROP CONSTRAINT IF EXISTS site_cost_builds_status_check;

ALTER TABLE site_cost_builds
  ADD CONSTRAINT site_cost_builds_status_check
  CHECK (status IN ('draft', 'running', 'complete', 'approved', 'locked', 'archived', 'failed'));

-- ── 5. Extend cost_sets ───────────────────────────────────────────────────────

ALTER TABLE cost_sets
  ADD COLUMN IF NOT EXISTS price_list_version_id uuid REFERENCES price_list_versions(id);

-- ── 6. Fix sites.status — remove pending_delete / deleted ─────────────────────
-- Business rule: Sites with historical data can only be archived, never deleted.
-- Only active and archived statuses are valid going forward.

ALTER TABLE sites DROP CONSTRAINT IF EXISTS sites_status_check;

UPDATE sites SET status = 'archived' WHERE status IN ('pending_delete', 'deleted');

ALTER TABLE sites ADD CONSTRAINT sites_status_check
  CHECK (status IN ('active', 'archived'));

-- ── 7. Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS country_price_lists_org_country_idx
  ON country_price_lists (organization_id, country_code);

CREATE INDEX IF NOT EXISTS price_list_versions_price_list_idx
  ON price_list_versions (price_list_id, status, effective_date DESC);

CREATE INDEX IF NOT EXISTS price_list_version_items_version_idx
  ON price_list_version_items (price_list_version_id);

CREATE INDEX IF NOT EXISTS price_list_version_items_sku_idx
  ON price_list_version_items (sku_id)
  WHERE sku_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS site_cost_builds_price_list_version_idx
  ON site_cost_builds (price_list_version_id)
  WHERE price_list_version_id IS NOT NULL;

-- ── 8. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE country_price_lists      ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_list_versions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_list_version_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation" ON country_price_lists
  FOR ALL USING (organization_id = auth_org_id());

CREATE POLICY "org_isolation" ON price_list_versions
  FOR ALL USING (organization_id = auth_org_id());

CREATE POLICY "org_isolation" ON price_list_version_items
  FOR ALL USING (organization_id = auth_org_id());

-- ── 9. Extend audit_log event types ───────────────────────────────────────────

ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_event_type_check;

ALTER TABLE audit_log ADD CONSTRAINT audit_log_event_type_check
  CHECK (event_type IN (
    'data_insert', 'data_update', 'data_delete',
    'bom_approved', 'bom_superseded',
    'snapshot_approved',
    'rule_activated', 'rule_deactivated',
    'exception_approved', 'exception_rejected',
    'calculation_executed', 'valuation_executed',
    'user_invited', 'user_role_changed', 'user_deactivated',
    'cost_set_locked', 'adjustment_approved',
    'site_archived', 'site_restored',
    'price_list_version_created',
    'cost_build_approved',
    'cost_build_locked'
  ));
