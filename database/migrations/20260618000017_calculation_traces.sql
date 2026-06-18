-- M-017: calculation_traces, calculation_trace_lines, rule_execution_traces,
--        exception_execution_traces, cost_source_traces
-- Explainability tables. Written by the cost engine; read by the UI.
-- ADR-104: Traces are the authoritative record of what the engine decided.
-- All 5 tables are append-only after the trace header sets is_complete = true.

-- ─── calculation_traces ───────────────────────────────────────────────────────

CREATE TABLE calculation_traces (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id     uuid        NOT NULL,
  trace_type          text        NOT NULL,
  sku_id              uuid        NOT NULL,
  bom_version_id      uuid        NULL,
  cost_set_id         uuid        NOT NULL,
  valuation_date      date        NOT NULL,
  site_id             uuid        NULL,
  warehouse_id        uuid        NULL,
  project_id          uuid        NULL,
  quantity            numeric     NOT NULL DEFAULT 1,
  final_cost          numeric     NULL,
  currency            text        NOT NULL,
  has_warnings        boolean     NOT NULL DEFAULT false,
  warning_count       integer     NOT NULL DEFAULT 0,
  missing_cost_count  integer     NOT NULL DEFAULT 0,
  is_complete         boolean     NOT NULL DEFAULT false,
  engine_version      text        NOT NULL,
  triggered_by        uuid        NOT NULL,
  triggered_at        timestamptz NOT NULL,
  duration_ms         integer     NULL,
  trace_level         text        NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT calculation_traces_pkey
    PRIMARY KEY (id),
  CONSTRAINT calculation_traces_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT calculation_traces_sku_id_fkey
    FOREIGN KEY (sku_id) REFERENCES skus(id),
  CONSTRAINT calculation_traces_bom_version_id_fkey
    FOREIGN KEY (bom_version_id) REFERENCES bom_versions(id),
  CONSTRAINT calculation_traces_cost_set_id_fkey
    FOREIGN KEY (cost_set_id) REFERENCES cost_sets(id),
  CONSTRAINT calculation_traces_site_id_fkey
    FOREIGN KEY (site_id) REFERENCES sites(id),
  CONSTRAINT calculation_traces_warehouse_id_fkey
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  CONSTRAINT calculation_traces_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES projects(id),
  CONSTRAINT calculation_traces_triggered_by_fkey
    FOREIGN KEY (triggered_by) REFERENCES profiles(id),
  CONSTRAINT calculation_traces_trace_type_check
    CHECK (trace_type IN ('sku_cost', 'inventory_line')),
  CONSTRAINT calculation_traces_currency_check
    CHECK (char_length(currency) = 3),
  CONSTRAINT calculation_traces_trace_level_check
    CHECK (trace_level IN ('summary', 'detailed', 'full'))
);

-- No updated_at: immutable after is_complete = true (one allowed UPDATE by engine to set is_complete + final_cost).
COMMENT ON TABLE calculation_traces IS
  'Immutable header for a single cost calculation run. Every cost figure in the UI references a trace.';
COMMENT ON COLUMN calculation_traces.is_complete IS
  'Set to true (with final_cost) only after all child records are written. C-12: no further mutations after this.';

-- ─── calculation_trace_lines ──────────────────────────────────────────────────

CREATE TABLE calculation_trace_lines (
  id                   uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id      uuid        NOT NULL,
  trace_id             uuid        NOT NULL,
  parent_line_id       uuid        NULL,
  bom_line_id          uuid        NULL,
  depth                integer     NOT NULL DEFAULT 0,
  position             integer     NOT NULL DEFAULT 0,
  line_type            text        NOT NULL,
  sku_id               uuid        NULL,
  virtual_component_id uuid        NULL,
  quantity             numeric     NOT NULL,
  resolved_unit_cost   numeric     NULL,
  adjusted_unit_cost   numeric     NULL,
  line_total           numeric     NULL,
  cost_source_priority integer     NULL,
  cost_source_type     text        NULL,
  cost_source_id       uuid        NULL,
  cost_source_table    text        NULL,
  is_rolled_up         boolean     NOT NULL DEFAULT false,
  has_missing_cost     boolean     NOT NULL DEFAULT false,
  is_reference_only    boolean     NOT NULL DEFAULT false,
  warnings             jsonb       NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT calculation_trace_lines_pkey
    PRIMARY KEY (id),
  CONSTRAINT calculation_trace_lines_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT calculation_trace_lines_trace_id_fkey
    FOREIGN KEY (trace_id) REFERENCES calculation_traces(id),
  CONSTRAINT calculation_trace_lines_parent_line_id_fkey
    FOREIGN KEY (parent_line_id) REFERENCES calculation_trace_lines(id),
  CONSTRAINT calculation_trace_lines_bom_line_id_fkey
    FOREIGN KEY (bom_line_id) REFERENCES bom_lines(id),
  CONSTRAINT calculation_trace_lines_sku_id_fkey
    FOREIGN KEY (sku_id) REFERENCES skus(id),
  CONSTRAINT calculation_trace_lines_virtual_component_id_fkey
    FOREIGN KEY (virtual_component_id) REFERENCES virtual_components(id),
  CONSTRAINT calculation_trace_lines_line_type_check
    CHECK (line_type IN ('sku', 'virtual_component', 'adjustment', 'rollup_subtotal')),
  CONSTRAINT calculation_trace_lines_cost_source_priority_check
    CHECK (cost_source_priority IS NULL OR (cost_source_priority BETWEEN 1 AND 6)),
  CONSTRAINT calculation_trace_lines_cost_source_type_check
    CHECK (cost_source_type IS NULL OR cost_source_type IN (
      'cost_set_item_sku', 'cost_set_item_subfamily', 'cost_set_item_family',
      'cost_set_item_supplier', 'cost_set_item_global', 'supplier_price',
      'bom_rollup', 'virtual_fixed', 'virtual_percentage',
      'manual_adjustment', 'none'
    ))
);

COMMENT ON TABLE calculation_trace_lines IS
  'One record per BOM line evaluated. Mirrors BOM tree via parent_line_id for drill-down navigation.';

-- ─── rule_execution_traces ────────────────────────────────────────────────────

CREATE TABLE rule_execution_traces (
  id                           uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id              uuid        NOT NULL,
  trace_id                     uuid        NOT NULL,
  trace_line_id                uuid        NOT NULL,
  cost_rule_id                 uuid        NOT NULL,
  rule_name_snapshot           text        NOT NULL,
  rule_priority                integer     NOT NULL,
  condition_summary            text        NOT NULL,
  condition_result             boolean     NOT NULL,
  was_applied                  boolean     NOT NULL,
  suppressed_by_exception_id   uuid        NULL,
  value_before                 numeric     NULL,
  value_after                  numeric     NULL,
  delta                        numeric     NULL,
  created_at                   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rule_execution_traces_pkey
    PRIMARY KEY (id),
  CONSTRAINT rule_execution_traces_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT rule_execution_traces_trace_id_fkey
    FOREIGN KEY (trace_id) REFERENCES calculation_traces(id),
  CONSTRAINT rule_execution_traces_trace_line_id_fkey
    FOREIGN KEY (trace_line_id) REFERENCES calculation_trace_lines(id),
  CONSTRAINT rule_execution_traces_cost_rule_id_fkey
    FOREIGN KEY (cost_rule_id) REFERENCES cost_rules(id),
  CONSTRAINT rule_execution_traces_exception_id_fkey
    FOREIGN KEY (suppressed_by_exception_id) REFERENCES rule_exceptions(id)
);

COMMENT ON TABLE rule_execution_traces IS
  'One record per cost rule evaluated (fired or not). Enables "why was this rule applied/skipped?" drill-down.';

-- ─── exception_execution_traces ───────────────────────────────────────────────

CREATE TABLE exception_execution_traces (
  id                        uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id           uuid        NOT NULL,
  trace_id                  uuid        NOT NULL,
  trace_line_id             uuid        NOT NULL,
  rule_execution_trace_id   uuid        NOT NULL,
  rule_exception_id         uuid        NOT NULL,
  exception_type_snapshot   text        NOT NULL,
  justification_snapshot    text        NOT NULL,
  was_active                boolean     NOT NULL,
  suppression_applied       boolean     NOT NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT exception_execution_traces_pkey
    PRIMARY KEY (id),
  CONSTRAINT exception_execution_traces_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT exception_execution_traces_trace_id_fkey
    FOREIGN KEY (trace_id) REFERENCES calculation_traces(id),
  CONSTRAINT exception_execution_traces_trace_line_id_fkey
    FOREIGN KEY (trace_line_id) REFERENCES calculation_trace_lines(id),
  CONSTRAINT exception_execution_traces_rule_exec_trace_id_fkey
    FOREIGN KEY (rule_execution_trace_id) REFERENCES rule_execution_traces(id),
  CONSTRAINT exception_execution_traces_rule_exception_id_fkey
    FOREIGN KEY (rule_exception_id) REFERENCES rule_exceptions(id)
);

COMMENT ON TABLE exception_execution_traces IS
  'One record per exception evaluated. Links exception to the rule execution it affected.';

-- ─── cost_source_traces ───────────────────────────────────────────────────────

CREATE TABLE cost_source_traces (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id     uuid        NOT NULL,
  trace_id            uuid        NOT NULL,
  trace_line_id       uuid        NOT NULL,
  source_type         text        NOT NULL,
  source_record_id    uuid        NULL,
  source_table        text        NULL,
  scope_type          text        NULL,
  resolved_value      numeric     NULL,
  currency            text        NULL,
  priority_level      integer     NULL,
  was_selected        boolean     NOT NULL,
  rejection_reason    text        NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT cost_source_traces_pkey
    PRIMARY KEY (id),
  CONSTRAINT cost_source_traces_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT cost_source_traces_trace_id_fkey
    FOREIGN KEY (trace_id) REFERENCES calculation_traces(id),
  CONSTRAINT cost_source_traces_trace_line_id_fkey
    FOREIGN KEY (trace_line_id) REFERENCES calculation_trace_lines(id),
  CONSTRAINT cost_source_traces_source_type_check
    CHECK (source_type IN (
      'cost_set_item', 'supplier_price', 'manual_adjustment',
      'virtual_component_default', 'none'
    )),
  CONSTRAINT cost_source_traces_currency_check
    CHECK (currency IS NULL OR char_length(currency) = 3),
  CONSTRAINT cost_source_traces_priority_level_check
    CHECK (priority_level IS NULL OR (priority_level BETWEEN 1 AND 6))
);

COMMENT ON TABLE cost_source_traces IS
  'Every cost source evaluated per trace line — selected and rejected. Shows full precedence resolution.';
