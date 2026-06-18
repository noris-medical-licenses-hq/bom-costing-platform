-- M-016: inventory_snapshots, inventory_lines, inventory_valuation_results
-- ADR-103: unit_cost and total_value are frozen concrete values at approval time.
-- cost_set_snapshot JSONB ensures historical reproducibility even if live Cost Set changes.
-- OQ-09 resolved: scope_project_id is nullable; project-scoped snapshots deferred to Phase 2 UI.

-- ─── inventory_snapshots ─────────────────────────────────────────────────────

CREATE TABLE inventory_snapshots (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id       uuid        NOT NULL,
  snapshot_name         text        NOT NULL,
  snapshot_date         date        NOT NULL,
  snapshot_type         text        NOT NULL,
  cost_set_id           uuid        NOT NULL,
  cost_set_snapshot     jsonb       NULL,
  scope_site_id         uuid        NULL,
  scope_warehouse_id    uuid        NULL,
  scope_project_id      uuid        NULL,
  status                text        NOT NULL DEFAULT 'draft',
  total_quantity        numeric     NULL,
  total_value           numeric     NULL,
  base_currency         text        NOT NULL,
  line_count            integer     NULL,
  missing_cost_count    integer     NULL,
  notes                 text        NULL,
  approved_by           uuid        NULL,
  approved_at           timestamptz NULL,
  created_by            uuid        NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid        NOT NULL,
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT inventory_snapshots_pkey
    PRIMARY KEY (id),
  CONSTRAINT inventory_snapshots_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT inventory_snapshots_cost_set_id_fkey
    FOREIGN KEY (cost_set_id) REFERENCES cost_sets(id),
  CONSTRAINT inventory_snapshots_scope_site_id_fkey
    FOREIGN KEY (scope_site_id) REFERENCES sites(id),
  CONSTRAINT inventory_snapshots_scope_warehouse_id_fkey
    FOREIGN KEY (scope_warehouse_id) REFERENCES warehouses(id),
  CONSTRAINT inventory_snapshots_scope_project_id_fkey
    FOREIGN KEY (scope_project_id) REFERENCES projects(id),
  CONSTRAINT inventory_snapshots_approved_by_fkey
    FOREIGN KEY (approved_by) REFERENCES profiles(id),
  CONSTRAINT inventory_snapshots_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id),
  CONSTRAINT inventory_snapshots_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES profiles(id),
  CONSTRAINT inventory_snapshots_snapshot_type_check
    CHECK (snapshot_type IN ('full', 'site', 'warehouse', 'project')),
  CONSTRAINT inventory_snapshots_status_check
    CHECK (status IN ('draft', 'under_review', 'approved', 'superseded', 'archived')),
  CONSTRAINT inventory_snapshots_base_currency_check
    CHECK (char_length(base_currency) = 3)
);

CREATE TRIGGER trg_inventory_snapshots_updated_at
  BEFORE UPDATE ON inventory_snapshots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE inventory_snapshots IS
  'Immutable point-in-time inventory record. Approved snapshots are permanently locked.';
COMMENT ON COLUMN inventory_snapshots.cost_set_snapshot IS
  'Frozen JSONB copy of all Cost Set Items at approval time. Ensures historical reproducibility (ADR-103).';
COMMENT ON COLUMN inventory_snapshots.scope_project_id IS
  'Nullable. Project-scoped snapshots deferred to Phase 2 UI (OQ-09). Schema is ready.';

-- ─── inventory_lines ─────────────────────────────────────────────────────────

CREATE TABLE inventory_lines (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL,
  snapshot_id      uuid        NOT NULL,
  sku_id           uuid        NOT NULL,
  warehouse_id     uuid        NOT NULL,
  quantity         numeric     NOT NULL,
  unit_cost        numeric     NULL,
  total_value      numeric     NULL,
  currency         text        NOT NULL,
  cost_trace_id    uuid        NULL,       -- FK stub; constraint added in M-020 after calculation_traces exists
  cost_source      text        NULL,
  bom_version_id   uuid        NULL,
  has_missing_cost boolean     NOT NULL DEFAULT false,
  notes            text        NULL,
  created_by       uuid        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid        NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT inventory_lines_pkey
    PRIMARY KEY (id),
  CONSTRAINT inventory_lines_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT inventory_lines_snapshot_id_fkey
    FOREIGN KEY (snapshot_id) REFERENCES inventory_snapshots(id),
  CONSTRAINT inventory_lines_sku_id_fkey
    FOREIGN KEY (sku_id) REFERENCES skus(id),
  CONSTRAINT inventory_lines_warehouse_id_fkey
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  CONSTRAINT inventory_lines_bom_version_id_fkey
    FOREIGN KEY (bom_version_id) REFERENCES bom_versions(id),
  CONSTRAINT inventory_lines_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id),
  CONSTRAINT inventory_lines_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES profiles(id),
  -- C-18: unique SKU per warehouse per snapshot
  CONSTRAINT inventory_lines_snapshot_sku_warehouse_key
    UNIQUE (snapshot_id, sku_id, warehouse_id),
  -- C-01: quantity must be positive
  CONSTRAINT inventory_lines_quantity_check
    CHECK (quantity > 0),
  CONSTRAINT inventory_lines_currency_check
    CHECK (char_length(currency) = 3),
  CONSTRAINT inventory_lines_cost_source_check
    CHECK (cost_source IS NULL OR cost_source IN (
      'cost_set_item', 'supplier_price', 'bom_rollup', 'manual_adjustment', 'none'
    ))
);

CREATE TRIGGER trg_inventory_lines_updated_at
  BEFORE UPDATE ON inventory_lines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE inventory_lines IS
  'One line per SKU per warehouse per snapshot. unit_cost and total_value are frozen at valuation time.';
COMMENT ON COLUMN inventory_lines.cost_trace_id IS
  'FK to calculation_traces.id. Constraint added in M-020 (deferred: traces table not yet created).';
COMMENT ON COLUMN inventory_lines.unit_cost IS
  'Frozen concrete value at valuation time — not a reference. NULL means cost was not resolved.';

-- ─── inventory_valuation_results ─────────────────────────────────────────────

CREATE TABLE inventory_valuation_results (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id     uuid        NOT NULL,
  snapshot_id         uuid        NOT NULL,
  group_type          text        NOT NULL,
  group_id            uuid        NULL,
  group_name          text        NOT NULL,
  total_quantity      numeric     NOT NULL,
  total_value         numeric     NOT NULL,
  currency            text        NOT NULL,
  line_count          integer     NOT NULL,
  missing_cost_count  integer     NOT NULL,
  created_by          uuid        NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT inventory_valuation_results_pkey
    PRIMARY KEY (id),
  CONSTRAINT inventory_valuation_results_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT inventory_valuation_results_snapshot_id_fkey
    FOREIGN KEY (snapshot_id) REFERENCES inventory_snapshots(id),
  CONSTRAINT inventory_valuation_results_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id),
  CONSTRAINT inventory_valuation_results_group_type_check
    CHECK (group_type IN ('all', 'site', 'warehouse', 'family', 'subfamily')),
  CONSTRAINT inventory_valuation_results_currency_check
    CHECK (char_length(currency) = 3)
);

-- No updated_at: write-once at snapshot approval time, never modified.
COMMENT ON TABLE inventory_valuation_results IS
  'Pre-aggregated valuation totals. Write-once at snapshot approval. Fast-read layer for reporting.';
