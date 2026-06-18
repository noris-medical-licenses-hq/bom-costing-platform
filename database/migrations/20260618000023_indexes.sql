-- M-023: Performance indexes
-- All indexes from DATA_MODEL.md §13, Indexing Strategy.
-- Partial indexes (hot-path queries with WHERE clauses) are the most critical.
-- Unique indexes already created inline in table definitions; only non-unique indexes here.
-- organization_id index on every tenant table (RLS policy hot path).

-- ─── Mandatory: organization_id on every tenant-owned table ───────────────────

CREATE INDEX idx_profiles_org               ON profiles               (organization_id);
CREATE INDEX idx_families_org               ON families               (organization_id);
CREATE INDEX idx_subfamilies_org            ON subfamilies            (organization_id);
CREATE INDEX idx_suppliers_org              ON suppliers              (organization_id);
CREATE INDEX idx_skus_org                   ON skus                   (organization_id);
CREATE INDEX idx_supplier_prices_org        ON supplier_prices        (organization_id);
CREATE INDEX idx_virtual_components_org     ON virtual_components     (organization_id);
CREATE INDEX idx_sites_org                  ON sites                  (organization_id);
CREATE INDEX idx_warehouses_org             ON warehouses             (organization_id);
CREATE INDEX idx_projects_org               ON projects               (organization_id);
CREATE INDEX idx_cost_sets_org              ON cost_sets              (organization_id);
CREATE INDEX idx_cost_items_org             ON cost_items             (organization_id);
CREATE INDEX idx_cost_rules_org             ON cost_rules             (organization_id);
CREATE INDEX idx_rule_conditions_org        ON rule_conditions        (organization_id);
CREATE INDEX idx_rule_actions_org           ON rule_actions           (organization_id);
CREATE INDEX idx_rule_exceptions_org        ON rule_exceptions        (organization_id);
CREATE INDEX idx_manual_adjustments_org     ON manual_cost_adjustments (organization_id);
CREATE INDEX idx_boms_org                   ON boms                   (organization_id);
CREATE INDEX idx_bom_versions_org           ON bom_versions           (organization_id);
CREATE INDEX idx_bom_lines_org              ON bom_lines              (organization_id);
CREATE INDEX idx_inventory_snapshots_org    ON inventory_snapshots    (organization_id);
CREATE INDEX idx_inventory_lines_org        ON inventory_lines        (organization_id);
CREATE INDEX idx_inventory_val_results_org  ON inventory_valuation_results (organization_id);
CREATE INDEX idx_calculation_traces_org     ON calculation_traces     (organization_id);
CREATE INDEX idx_calc_trace_lines_org       ON calculation_trace_lines (organization_id);
CREATE INDEX idx_rule_exec_traces_org       ON rule_execution_traces  (organization_id);
CREATE INDEX idx_exception_exec_traces_org  ON exception_execution_traces (organization_id);
CREATE INDEX idx_cost_source_traces_org     ON cost_source_traces     (organization_id);
CREATE INDEX idx_validation_runs_org        ON validation_runs        (organization_id);
CREATE INDEX idx_validation_findings_org    ON validation_findings    (organization_id);
CREATE INDEX idx_audit_log_org              ON audit_log              (organization_id);

-- ─── Product Master ────────────────────────────────────────────────────────────

CREATE INDEX idx_skus_org_family            ON skus (organization_id, family_id);
CREATE INDEX idx_skus_org_subfamily         ON skus (organization_id, subfamily_id);
CREATE INDEX idx_skus_org_status            ON skus (organization_id, status);
CREATE INDEX idx_skus_org_item_type_make_buy ON skus (organization_id, item_type, make_buy);

-- Hot path: active price lookup for a SKU+supplier on a date
CREATE INDEX idx_supplier_prices_sku_supplier_from ON supplier_prices (sku_id, supplier_id, effective_from);
CREATE INDEX idx_supplier_prices_sku_dates         ON supplier_prices (sku_id, effective_from, effective_to);
CREATE INDEX idx_supplier_prices_org_supplier      ON supplier_prices (organization_id, supplier_id);

-- ─── BOM ──────────────────────────────────────────────────────────────────────

CREATE INDEX idx_bom_versions_bom_status    ON bom_versions (bom_id, status);
CREATE INDEX idx_bom_lines_version          ON bom_lines (bom_version_id);
CREATE INDEX idx_bom_lines_parent           ON bom_lines (parent_line_id);
CREATE INDEX idx_bom_lines_sku              ON bom_lines (sku_id);
CREATE INDEX idx_bom_lines_version_parent_pos ON bom_lines (bom_version_id, parent_line_id, position);

-- ─── Costing ──────────────────────────────────────────────────────────────────

CREATE INDEX idx_cost_sets_org_status_dates ON cost_sets (organization_id, status, effective_from, effective_to);

-- Hot path: cost resolution lookup in the engine
CREATE INDEX idx_cost_items_set_scope_type_id ON cost_items (cost_set_id, scope_type, scope_id);
CREATE INDEX idx_cost_items_set_item_type_from ON cost_items (cost_set_id, item_type, effective_from);

CREATE INDEX idx_cost_rules_org_active_priority ON cost_rules (organization_id, is_active, priority);
CREATE INDEX idx_cost_rules_org_cost_set_scope  ON cost_rules (organization_id, cost_set_scope_id);
CREATE INDEX idx_rule_conditions_rule           ON rule_conditions (cost_rule_id);
CREATE INDEX idx_rule_actions_rule              ON rule_actions (cost_rule_id);
CREATE INDEX idx_rule_exceptions_rule_status    ON rule_exceptions (cost_rule_id, status);
CREATE INDEX idx_rule_exceptions_scope          ON rule_exceptions (exception_scope_type, exception_scope_id, status);

-- ─── Context & Inventory ──────────────────────────────────────────────────────

CREATE INDEX idx_warehouses_site               ON warehouses (site_id);
CREATE INDEX idx_inventory_snapshots_org_date_status ON inventory_snapshots (organization_id, snapshot_date, status);
CREATE INDEX idx_inventory_snapshots_org_warehouse_status ON inventory_snapshots (organization_id, scope_warehouse_id, status);
CREATE INDEX idx_inventory_lines_snapshot_missing ON inventory_lines (snapshot_id, has_missing_cost);
CREATE INDEX idx_inventory_lines_sku           ON inventory_lines (sku_id);

-- ─── Explainability ───────────────────────────────────────────────────────────

CREATE INDEX idx_calc_traces_org_sku_triggered  ON calculation_traces (organization_id, sku_id, triggered_at DESC);
CREATE INDEX idx_calc_traces_org_cost_set_date  ON calculation_traces (organization_id, cost_set_id, valuation_date);
CREATE INDEX idx_calc_trace_lines_trace_parent_pos ON calculation_trace_lines (trace_id, parent_line_id, position);
CREATE INDEX idx_calc_trace_lines_trace_depth   ON calculation_trace_lines (trace_id, depth);
CREATE INDEX idx_rule_exec_traces_trace_line    ON rule_execution_traces (trace_id, trace_line_id);
CREATE INDEX idx_rule_exec_traces_rule_applied  ON rule_execution_traces (cost_rule_id, was_applied);
CREATE INDEX idx_cost_source_traces_trace_line  ON cost_source_traces (trace_id, trace_line_id);
CREATE INDEX idx_cost_source_traces_trace_selected ON cost_source_traces (trace_id, was_selected);

-- ─── Validation & Audit ───────────────────────────────────────────────────────

CREATE INDEX idx_validation_runs_org_scope_type_id ON validation_runs (organization_id, scope_type, scope_id, triggered_at DESC);
CREATE INDEX idx_validation_findings_run_severity  ON validation_findings (validation_run_id, severity, status);
CREATE INDEX idx_validation_findings_entity        ON validation_findings (entity_type, entity_id);
CREATE INDEX idx_validation_findings_org_severity  ON validation_findings (organization_id, severity, status);
CREATE INDEX idx_audit_log_performed_at            ON audit_log (organization_id, performed_at DESC);
CREATE INDEX idx_audit_log_table_record            ON audit_log (table_name, record_id, performed_at DESC);
CREATE INDEX idx_audit_log_performed_by            ON audit_log (performed_by, performed_at DESC);
CREATE INDEX idx_audit_log_event_type              ON audit_log (event_type, performed_at DESC);

-- ─── Critical partial indexes ─────────────────────────────────────────────────
-- (bom_versions_one_approved_per_bom already created in M-015)

CREATE INDEX idx_skus_active_family
  ON skus (organization_id, family_id)
  WHERE status = 'active';

CREATE INDEX idx_cost_rules_active_priority
  ON cost_rules (organization_id, priority)
  WHERE is_active = true;

CREATE INDEX idx_rule_exceptions_active_lookup
  ON rule_exceptions (cost_rule_id, exception_scope_id)
  WHERE status = 'active';

CREATE INDEX idx_supplier_prices_current
  ON supplier_prices (sku_id, supplier_id)
  WHERE effective_to IS NULL;
