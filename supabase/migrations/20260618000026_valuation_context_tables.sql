-- M-026: Inventory Valuation Context Framework
-- Provides a persistent, reproducible, multi-currency valuation layer.
-- Completely separate from inventory_snapshots: one snapshot can have many reports.
-- inventory_snapshots.cost_set_id is NOT modified (approved per brief).

-- ─── valuation_reports ───────────────────────────────────────────────────────

CREATE TABLE valuation_reports (
  id                   uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id      uuid        NOT NULL,
  snapshot_id          uuid        NOT NULL,
  cost_set_id          uuid        NOT NULL,
  valuation_currency   text        NOT NULL,
  valuation_scenario   text        NOT NULL DEFAULT 'management',
  exchange_rate_source text        NOT NULL DEFAULT 'manual',
  fx_snapshot_name     text        NULL,
  warehouse_filter     text        NOT NULL DEFAULT 'all',
  status               text        NOT NULL DEFAULT 'draft',
  total_value          numeric     NULL,
  line_count           integer     NULL,
  missing_cost_count   integer     NULL,
  parameters_snapshot  jsonb       NULL,
  notes                text        NULL,
  approved_by          uuid        NULL,
  approved_at          timestamptz NULL,
  created_by           uuid        NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  completed_at         timestamptz NULL,
  updated_by           uuid        NOT NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT valuation_reports_pkey
    PRIMARY KEY (id),
  CONSTRAINT valuation_reports_org_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT valuation_reports_snapshot_fkey
    FOREIGN KEY (snapshot_id) REFERENCES inventory_snapshots(id),
  CONSTRAINT valuation_reports_cost_set_fkey
    FOREIGN KEY (cost_set_id) REFERENCES cost_sets(id),
  CONSTRAINT valuation_reports_approved_by_fkey
    FOREIGN KEY (approved_by) REFERENCES profiles(id),
  CONSTRAINT valuation_reports_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id),
  CONSTRAINT valuation_reports_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES profiles(id),
  CONSTRAINT valuation_reports_currency_check
    CHECK (char_length(valuation_currency) = 3),
  CONSTRAINT valuation_reports_scenario_check
    CHECK (valuation_scenario IN ('month_end', 'audit', 'management', 'budget', 'forecast')),
  CONSTRAINT valuation_reports_fx_source_check
    CHECK (exchange_rate_source IN ('stored', 'manual', 'corporate')),
  CONSTRAINT valuation_reports_wh_filter_check
    CHECK (warehouse_filter IN ('all', 'selected')),
  CONSTRAINT valuation_reports_status_check
    CHECK (status IN ('draft', 'running', 'complete', 'approved', 'locked', 'failed'))
);

CREATE TRIGGER trg_valuation_reports_updated_at
  BEFORE UPDATE ON valuation_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE valuation_reports IS
  'One valuation run per row. References snapshot + cost set + currency. Multiple reports per snapshot are supported.';
COMMENT ON COLUMN valuation_reports.parameters_snapshot IS
  'Frozen JSONB copy of all parameters and computed totals at run time. Ensures self-contained reproducibility.';
COMMENT ON COLUMN valuation_reports.fx_snapshot_name IS
  'User-assigned label for the exchange rate set used (e.g., "June 2026 ECB Rates").';

-- ─── valuation_report_warehouse_filters ──────────────────────────────────────

CREATE TABLE valuation_report_warehouse_filters (
  id                uuid        NOT NULL DEFAULT gen_random_uuid(),
  report_id         uuid        NOT NULL,
  warehouse_id      uuid        NOT NULL,
  included          boolean     NOT NULL DEFAULT true,
  exclusion_reason  text        NULL,

  CONSTRAINT vr_wf_pkey
    PRIMARY KEY (id),
  CONSTRAINT vr_wf_report_fkey
    FOREIGN KEY (report_id) REFERENCES valuation_reports(id) ON DELETE CASCADE,
  CONSTRAINT vr_wf_warehouse_fkey
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  CONSTRAINT vr_wf_unique
    UNIQUE (report_id, warehouse_id),
  CONSTRAINT vr_wf_exclusion_reason_required
    CHECK (included = true OR (exclusion_reason IS NOT NULL AND exclusion_reason <> ''))
);

COMMENT ON COLUMN valuation_report_warehouse_filters.exclusion_reason IS
  'Required when included = false. Documents why the warehouse was excluded from this report.';

-- ─── valuation_report_exchange_rates ─────────────────────────────────────────

CREATE TABLE valuation_report_exchange_rates (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  report_id       uuid        NOT NULL,
  from_currency   text        NOT NULL,
  to_currency     text        NOT NULL,
  rate            numeric     NOT NULL,
  source          text        NOT NULL DEFAULT 'manual',
  effective_date  date        NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT vr_fx_pkey
    PRIMARY KEY (id),
  CONSTRAINT vr_fx_report_fkey
    FOREIGN KEY (report_id) REFERENCES valuation_reports(id) ON DELETE CASCADE,
  CONSTRAINT vr_fx_rate_check
    CHECK (rate > 0),
  CONSTRAINT vr_fx_source_check
    CHECK (source IN ('stored', 'manual', 'corporate')),
  CONSTRAINT vr_fx_from_check
    CHECK (char_length(from_currency) = 3),
  CONSTRAINT vr_fx_to_check
    CHECK (char_length(to_currency) = 3),
  CONSTRAINT vr_fx_unique
    UNIQUE (report_id, from_currency, to_currency)
);

COMMENT ON TABLE valuation_report_exchange_rates IS
  'Exchange rates frozen at report creation time. These never change after the report runs, ensuring historical reproducibility.';

-- ─── valuation_report_lines ───────────────────────────────────────────────────

CREATE TABLE valuation_report_lines (
  id                            uuid        NOT NULL DEFAULT gen_random_uuid(),
  report_id                     uuid        NOT NULL,
  snapshot_line_id              uuid        NULL,
  sku_id                        uuid        NOT NULL,
  warehouse_id                  uuid        NULL,
  quantity                      numeric     NOT NULL,
  source_currency               text        NOT NULL,
  unit_cost_source_currency     numeric     NULL,
  exchange_rate_used            numeric     NOT NULL DEFAULT 1,
  unit_cost_valuation_currency  numeric     NULL,
  line_total_valuation_currency numeric     NULL,
  cost_item_id                  uuid        NULL,
  cost_source                   text        NULL,
  has_missing_cost              boolean     NOT NULL DEFAULT false,
  notes                         text        NULL,

  CONSTRAINT vr_lines_pkey
    PRIMARY KEY (id),
  CONSTRAINT vr_lines_report_fkey
    FOREIGN KEY (report_id) REFERENCES valuation_reports(id) ON DELETE CASCADE,
  CONSTRAINT vr_lines_sku_fkey
    FOREIGN KEY (sku_id) REFERENCES skus(id),
  CONSTRAINT vr_lines_warehouse_fkey
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  CONSTRAINT vr_lines_snapshot_line_fkey
    FOREIGN KEY (snapshot_line_id) REFERENCES inventory_lines(id),
  CONSTRAINT vr_lines_currency_check
    CHECK (char_length(source_currency) = 3),
  CONSTRAINT vr_lines_cost_source_check
    CHECK (cost_source IS NULL OR cost_source IN (
      'cost_set_item', 'supplier_price', 'bom_rollup', 'manual_adjustment', 'none'
    ))
);

COMMENT ON TABLE valuation_report_lines IS
  'Write-once computed values per SKU per warehouse. Never updated after report completion. The source of truth for reproducibility.';
COMMENT ON COLUMN valuation_report_lines.unit_cost_source_currency IS
  'Unit cost in the original cost item currency before FX conversion. NULL = no cost found.';
COMMENT ON COLUMN valuation_report_lines.exchange_rate_used IS
  'The exact exchange rate applied for this line. Stored here so the conversion is auditable even if rates change later.';

-- ─── corporate_exchange_rates ─────────────────────────────────────────────────

CREATE TABLE corporate_exchange_rates (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL,
  from_currency   text        NOT NULL,
  to_currency     text        NOT NULL,
  rate            numeric     NOT NULL,
  effective_date  date        NOT NULL,
  source_label    text        NULL,
  created_by      uuid        NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT corp_fx_pkey
    PRIMARY KEY (id),
  CONSTRAINT corp_fx_org_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT corp_fx_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id),
  CONSTRAINT corp_fx_rate_check
    CHECK (rate > 0),
  CONSTRAINT corp_fx_from_check
    CHECK (char_length(from_currency) = 3),
  CONSTRAINT corp_fx_to_check
    CHECK (char_length(to_currency) = 3),
  CONSTRAINT corp_fx_unique
    UNIQUE (organization_id, from_currency, to_currency, effective_date)
);

COMMENT ON TABLE corporate_exchange_rates IS
  'Admin-managed exchange rate table. Used when exchange_rate_source = ''corporate''. Rates are copied into valuation_report_exchange_rates at report creation to freeze them.';

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS vr_org_created_idx      ON valuation_reports (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS vr_snapshot_idx         ON valuation_reports (snapshot_id);
CREATE INDEX IF NOT EXISTS vr_status_idx           ON valuation_reports (organization_id, status);
CREATE INDEX IF NOT EXISTS vr_lines_report_idx     ON valuation_report_lines (report_id);
CREATE INDEX IF NOT EXISTS vr_lines_sku_idx        ON valuation_report_lines (sku_id);
CREATE INDEX IF NOT EXISTS vr_lines_missing_idx    ON valuation_report_lines (report_id, has_missing_cost);
CREATE INDEX IF NOT EXISTS corp_fx_org_date_idx    ON corporate_exchange_rates (organization_id, effective_date DESC);
