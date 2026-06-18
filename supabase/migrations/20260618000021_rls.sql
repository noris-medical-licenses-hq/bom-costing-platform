-- M-021: Row Level Security — enable RLS and create all policies
-- Pattern: every tenant-owned table isolates by organization_id.
-- Helper functions auth_org_id(), auth_user_role(), auth_has_role() defined in M-003.
-- Service role bypasses RLS — only used server-side, never in browser (ARCHITECTURE.md).
-- OQ-05 resolved: audit_log SELECT restricted to admin and approver roles.

-- ─── Enable RLS on all business tables ────────────────────────────────────────

ALTER TABLE organizations                ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE families                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE subfamilies                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE skus                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_prices              ENABLE ROW LEVEL SECURITY;
ALTER TABLE virtual_components           ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_sets                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_items                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_rules                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE rule_conditions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE rule_actions                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE rule_exceptions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_cost_adjustments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE boms                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE bom_versions                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE bom_lines                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_snapshots          ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_lines              ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_valuation_results  ENABLE ROW LEVEL SECURITY;
ALTER TABLE calculation_traces           ENABLE ROW LEVEL SECURITY;
ALTER TABLE calculation_trace_lines      ENABLE ROW LEVEL SECURITY;
ALTER TABLE rule_execution_traces        ENABLE ROW LEVEL SECURITY;
ALTER TABLE exception_execution_traces   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_source_traces           ENABLE ROW LEVEL SECURITY;
ALTER TABLE validation_runs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE validation_findings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log                    ENABLE ROW LEVEL SECURITY;

-- ─── organizations ────────────────────────────────────────────────────────────

CREATE POLICY "organizations_select"
  ON organizations FOR SELECT
  USING (id = auth_org_id());

-- No INSERT/UPDATE/DELETE for app users — super-admin only via service role.

-- ─── profiles ─────────────────────────────────────────────────────────────────

CREATE POLICY "profiles_select"
  ON profiles FOR SELECT
  USING (organization_id = auth_org_id());

CREATE POLICY "profiles_insert"
  ON profiles FOR INSERT
  WITH CHECK (
    organization_id = auth_org_id() AND
    auth_has_role(ARRAY['admin'])
  );

CREATE POLICY "profiles_update"
  ON profiles FOR UPDATE
  USING (organization_id = auth_org_id())
  WITH CHECK (
    organization_id = auth_org_id() AND
    auth_has_role(ARRAY['admin'])
  );

-- No DELETE: profiles are deactivated (is_active = false), never hard-deleted.

-- ─── families ─────────────────────────────────────────────────────────────────

CREATE POLICY "families_select"
  ON families FOR SELECT
  USING (organization_id = auth_org_id());

CREATE POLICY "families_insert"
  ON families FOR INSERT
  WITH CHECK (
    organization_id = auth_org_id() AND
    auth_has_role(ARRAY['editor', 'cost_analyst', 'admin'])
  );

CREATE POLICY "families_update"
  ON families FOR UPDATE
  USING (organization_id = auth_org_id())
  WITH CHECK (
    organization_id = auth_org_id() AND
    auth_has_role(ARRAY['editor', 'cost_analyst', 'admin'])
  );

-- ─── subfamilies ──────────────────────────────────────────────────────────────

CREATE POLICY "subfamilies_select"
  ON subfamilies FOR SELECT
  USING (organization_id = auth_org_id());

CREATE POLICY "subfamilies_insert"
  ON subfamilies FOR INSERT
  WITH CHECK (
    organization_id = auth_org_id() AND
    auth_has_role(ARRAY['editor', 'cost_analyst', 'admin'])
  );

CREATE POLICY "subfamilies_update"
  ON subfamilies FOR UPDATE
  USING (organization_id = auth_org_id())
  WITH CHECK (
    organization_id = auth_org_id() AND
    auth_has_role(ARRAY['editor', 'cost_analyst', 'admin'])
  );

-- ─── suppliers ────────────────────────────────────────────────────────────────

CREATE POLICY "suppliers_select"
  ON suppliers FOR SELECT
  USING (organization_id = auth_org_id());

CREATE POLICY "suppliers_insert"
  ON suppliers FOR INSERT
  WITH CHECK (
    organization_id = auth_org_id() AND
    auth_has_role(ARRAY['procurement', 'admin'])
  );

CREATE POLICY "suppliers_update"
  ON suppliers FOR UPDATE
  USING (organization_id = auth_org_id())
  WITH CHECK (
    organization_id = auth_org_id() AND
    auth_has_role(ARRAY['procurement', 'admin'])
  );

-- ─── skus ─────────────────────────────────────────────────────────────────────

CREATE POLICY "skus_select"
  ON skus FOR SELECT
  USING (organization_id = auth_org_id());

CREATE POLICY "skus_insert"
  ON skus FOR INSERT
  WITH CHECK (
    organization_id = auth_org_id() AND
    auth_has_role(ARRAY['editor', 'cost_analyst', 'admin'])
  );

CREATE POLICY "skus_update"
  ON skus FOR UPDATE
  USING (organization_id = auth_org_id())
  WITH CHECK (
    organization_id = auth_org_id() AND
    auth_has_role(ARRAY['editor', 'cost_analyst', 'admin'])
  );

-- ─── supplier_prices ──────────────────────────────────────────────────────────

CREATE POLICY "supplier_prices_select"
  ON supplier_prices FOR SELECT
  USING (organization_id = auth_org_id());

CREATE POLICY "supplier_prices_insert"
  ON supplier_prices FOR INSERT
  WITH CHECK (
    organization_id = auth_org_id() AND
    auth_has_role(ARRAY['procurement', 'admin'])
  );

CREATE POLICY "supplier_prices_update"
  ON supplier_prices FOR UPDATE
  USING (organization_id = auth_org_id())
  WITH CHECK (
    organization_id = auth_org_id() AND
    auth_has_role(ARRAY['procurement', 'admin'])
  );

-- ─── virtual_components ───────────────────────────────────────────────────────

CREATE POLICY "virtual_components_select"
  ON virtual_components FOR SELECT
  USING (organization_id = auth_org_id());

CREATE POLICY "virtual_components_insert"
  ON virtual_components FOR INSERT
  WITH CHECK (
    organization_id = auth_org_id() AND
    auth_has_role(ARRAY['cost_analyst', 'admin'])
  );

CREATE POLICY "virtual_components_update"
  ON virtual_components FOR UPDATE
  USING (organization_id = auth_org_id())
  WITH CHECK (
    organization_id = auth_org_id() AND
    auth_has_role(ARRAY['cost_analyst', 'admin'])
  );

-- ─── sites / warehouses / projects ────────────────────────────────────────────

CREATE POLICY "sites_select"    ON sites    FOR SELECT USING (organization_id = auth_org_id());
CREATE POLICY "sites_insert"    ON sites    FOR INSERT WITH CHECK (organization_id = auth_org_id() AND auth_has_role(ARRAY['admin']));
CREATE POLICY "sites_update"    ON sites    FOR UPDATE USING (organization_id = auth_org_id()) WITH CHECK (organization_id = auth_org_id() AND auth_has_role(ARRAY['admin']));

CREATE POLICY "warehouses_select" ON warehouses FOR SELECT USING (organization_id = auth_org_id());
CREATE POLICY "warehouses_insert" ON warehouses FOR INSERT WITH CHECK (organization_id = auth_org_id() AND auth_has_role(ARRAY['admin']));
CREATE POLICY "warehouses_update" ON warehouses FOR UPDATE USING (organization_id = auth_org_id()) WITH CHECK (organization_id = auth_org_id() AND auth_has_role(ARRAY['admin']));

CREATE POLICY "projects_select" ON projects FOR SELECT USING (organization_id = auth_org_id());
CREATE POLICY "projects_insert" ON projects FOR INSERT WITH CHECK (organization_id = auth_org_id() AND auth_has_role(ARRAY['editor', 'admin']));
CREATE POLICY "projects_update" ON projects FOR UPDATE USING (organization_id = auth_org_id()) WITH CHECK (organization_id = auth_org_id() AND auth_has_role(ARRAY['editor', 'admin']));

-- ─── cost_sets / cost_items ───────────────────────────────────────────────────

CREATE POLICY "cost_sets_select" ON cost_sets FOR SELECT USING (organization_id = auth_org_id());
CREATE POLICY "cost_sets_insert" ON cost_sets FOR INSERT WITH CHECK (organization_id = auth_org_id() AND auth_has_role(ARRAY['cost_analyst', 'admin']));
CREATE POLICY "cost_sets_update" ON cost_sets FOR UPDATE
  USING (organization_id = auth_org_id() AND is_locked = false)
  WITH CHECK (organization_id = auth_org_id() AND auth_has_role(ARRAY['cost_analyst', 'admin']));

CREATE POLICY "cost_items_select" ON cost_items FOR SELECT USING (organization_id = auth_org_id());
CREATE POLICY "cost_items_insert" ON cost_items FOR INSERT
  WITH CHECK (
    organization_id = auth_org_id() AND
    auth_has_role(ARRAY['cost_analyst', 'admin']) AND
    EXISTS (SELECT 1 FROM cost_sets WHERE id = cost_set_id AND is_locked = false AND organization_id = auth_org_id())
  );
CREATE POLICY "cost_items_update" ON cost_items FOR UPDATE
  USING (organization_id = auth_org_id() AND EXISTS (SELECT 1 FROM cost_sets WHERE id = cost_set_id AND is_locked = false AND organization_id = auth_org_id()))
  WITH CHECK (organization_id = auth_org_id() AND auth_has_role(ARRAY['cost_analyst', 'admin']));

-- ─── cost_rules / rule_conditions / rule_actions ─────────────────────────────

CREATE POLICY "cost_rules_select" ON cost_rules FOR SELECT USING (organization_id = auth_org_id());
CREATE POLICY "cost_rules_insert" ON cost_rules FOR INSERT WITH CHECK (organization_id = auth_org_id() AND auth_has_role(ARRAY['cost_analyst', 'admin']));
CREATE POLICY "cost_rules_update" ON cost_rules FOR UPDATE USING (organization_id = auth_org_id()) WITH CHECK (organization_id = auth_org_id() AND auth_has_role(ARRAY['cost_analyst', 'admin']));

-- rule_conditions: INSERT only when parent rule is NOT active (OQ-03: app-layer immutability)
CREATE POLICY "rule_conditions_select" ON rule_conditions FOR SELECT USING (organization_id = auth_org_id());
CREATE POLICY "rule_conditions_insert" ON rule_conditions FOR INSERT
  WITH CHECK (
    organization_id = auth_org_id() AND
    auth_has_role(ARRAY['cost_analyst', 'admin']) AND
    EXISTS (SELECT 1 FROM cost_rules WHERE id = cost_rule_id AND is_active = false AND organization_id = auth_org_id())
  );
-- No UPDATE or DELETE on rule_conditions (immutable once rule activated — enforced at app layer).

CREATE POLICY "rule_actions_select" ON rule_actions FOR SELECT USING (organization_id = auth_org_id());
CREATE POLICY "rule_actions_insert" ON rule_actions FOR INSERT
  WITH CHECK (
    organization_id = auth_org_id() AND
    auth_has_role(ARRAY['cost_analyst', 'admin']) AND
    EXISTS (SELECT 1 FROM cost_rules WHERE id = cost_rule_id AND is_active = false AND organization_id = auth_org_id())
  );

-- ─── rule_exceptions ──────────────────────────────────────────────────────────

CREATE POLICY "rule_exceptions_select" ON rule_exceptions FOR SELECT USING (organization_id = auth_org_id());
CREATE POLICY "rule_exceptions_insert" ON rule_exceptions FOR INSERT
  WITH CHECK (organization_id = auth_org_id() AND auth_has_role(ARRAY['cost_analyst', 'admin']));
CREATE POLICY "rule_exceptions_update" ON rule_exceptions FOR UPDATE
  USING (organization_id = auth_org_id())
  WITH CHECK (organization_id = auth_org_id() AND auth_has_role(ARRAY['approver', 'admin']));

-- ─── manual_cost_adjustments ──────────────────────────────────────────────────

CREATE POLICY "manual_cost_adjustments_select" ON manual_cost_adjustments FOR SELECT USING (organization_id = auth_org_id());
CREATE POLICY "manual_cost_adjustments_insert" ON manual_cost_adjustments FOR INSERT WITH CHECK (organization_id = auth_org_id() AND auth_has_role(ARRAY['cost_analyst', 'admin']));
CREATE POLICY "manual_cost_adjustments_update" ON manual_cost_adjustments FOR UPDATE USING (organization_id = auth_org_id()) WITH CHECK (organization_id = auth_org_id() AND auth_has_role(ARRAY['approver', 'admin']));

-- ─── boms / bom_versions / bom_lines ─────────────────────────────────────────

CREATE POLICY "boms_select" ON boms FOR SELECT USING (organization_id = auth_org_id());
CREATE POLICY "boms_insert" ON boms FOR INSERT WITH CHECK (organization_id = auth_org_id() AND auth_has_role(ARRAY['editor', 'admin']));
CREATE POLICY "boms_update" ON boms FOR UPDATE USING (organization_id = auth_org_id()) WITH CHECK (organization_id = auth_org_id() AND auth_has_role(ARRAY['editor', 'admin']));

CREATE POLICY "bom_versions_select" ON bom_versions FOR SELECT USING (organization_id = auth_org_id());
CREATE POLICY "bom_versions_insert" ON bom_versions FOR INSERT WITH CHECK (organization_id = auth_org_id() AND auth_has_role(ARRAY['editor', 'admin']));
CREATE POLICY "bom_versions_update" ON bom_versions FOR UPDATE
  USING (organization_id = auth_org_id())
  WITH CHECK (organization_id = auth_org_id() AND auth_has_role(ARRAY['editor', 'approver', 'admin']));

-- bom_lines: INSERT/UPDATE/DELETE only when bom_version is NOT locked
CREATE POLICY "bom_lines_select" ON bom_lines FOR SELECT USING (organization_id = auth_org_id());
CREATE POLICY "bom_lines_insert" ON bom_lines FOR INSERT
  WITH CHECK (
    organization_id = auth_org_id() AND
    auth_has_role(ARRAY['editor', 'admin']) AND
    EXISTS (SELECT 1 FROM bom_versions WHERE id = bom_version_id AND is_locked = false AND organization_id = auth_org_id())
  );
CREATE POLICY "bom_lines_update" ON bom_lines FOR UPDATE
  USING (organization_id = auth_org_id() AND EXISTS (SELECT 1 FROM bom_versions WHERE id = bom_version_id AND is_locked = false AND organization_id = auth_org_id()))
  WITH CHECK (organization_id = auth_org_id() AND auth_has_role(ARRAY['editor', 'admin']));
CREATE POLICY "bom_lines_delete" ON bom_lines FOR DELETE
  USING (
    organization_id = auth_org_id() AND
    auth_has_role(ARRAY['editor', 'admin']) AND
    EXISTS (SELECT 1 FROM bom_versions WHERE id = bom_version_id AND is_locked = false AND organization_id = auth_org_id())
  );

-- ─── inventory tables ─────────────────────────────────────────────────────────

CREATE POLICY "inventory_snapshots_select" ON inventory_snapshots FOR SELECT USING (organization_id = auth_org_id());
CREATE POLICY "inventory_snapshots_insert" ON inventory_snapshots FOR INSERT WITH CHECK (organization_id = auth_org_id() AND auth_has_role(ARRAY['editor', 'admin']));
CREATE POLICY "inventory_snapshots_update" ON inventory_snapshots FOR UPDATE
  USING (organization_id = auth_org_id())
  WITH CHECK (organization_id = auth_org_id() AND auth_has_role(ARRAY['editor', 'approver', 'admin']));

CREATE POLICY "inventory_lines_select" ON inventory_lines FOR SELECT USING (organization_id = auth_org_id());
CREATE POLICY "inventory_lines_insert" ON inventory_lines FOR INSERT
  WITH CHECK (
    organization_id = auth_org_id() AND
    auth_has_role(ARRAY['editor', 'admin']) AND
    EXISTS (SELECT 1 FROM inventory_snapshots WHERE id = snapshot_id AND status = 'draft' AND organization_id = auth_org_id())
  );
CREATE POLICY "inventory_lines_update" ON inventory_lines FOR UPDATE
  USING (organization_id = auth_org_id() AND EXISTS (SELECT 1 FROM inventory_snapshots WHERE id = snapshot_id AND status = 'draft' AND organization_id = auth_org_id()))
  WITH CHECK (organization_id = auth_org_id() AND auth_has_role(ARRAY['editor', 'admin']));
CREATE POLICY "inventory_lines_delete" ON inventory_lines FOR DELETE
  USING (
    organization_id = auth_org_id() AND
    auth_has_role(ARRAY['editor', 'admin']) AND
    EXISTS (SELECT 1 FROM inventory_snapshots WHERE id = snapshot_id AND status = 'draft' AND organization_id = auth_org_id())
  );

-- inventory_valuation_results: SELECT only for app users; INSERT via service role
CREATE POLICY "inventory_valuation_results_select" ON inventory_valuation_results FOR SELECT USING (organization_id = auth_org_id());

-- ─── explainability tables (service role only for writes) ─────────────────────

CREATE POLICY "calculation_traces_select"      ON calculation_traces      FOR SELECT USING (organization_id = auth_org_id());
CREATE POLICY "calculation_trace_lines_select" ON calculation_trace_lines FOR SELECT USING (organization_id = auth_org_id());
CREATE POLICY "rule_execution_traces_select"   ON rule_execution_traces   FOR SELECT USING (organization_id = auth_org_id());
CREATE POLICY "exception_exec_traces_select"   ON exception_execution_traces FOR SELECT USING (organization_id = auth_org_id());
CREATE POLICY "cost_source_traces_select"      ON cost_source_traces      FOR SELECT USING (organization_id = auth_org_id());

-- ─── validation tables ────────────────────────────────────────────────────────

CREATE POLICY "validation_runs_select"    ON validation_runs    FOR SELECT USING (organization_id = auth_org_id());
CREATE POLICY "validation_findings_select" ON validation_findings FOR SELECT USING (organization_id = auth_org_id());
-- findings status updates (acknowledge/resolve) — cost_analyst and above
CREATE POLICY "validation_findings_update" ON validation_findings FOR UPDATE
  USING (organization_id = auth_org_id())
  WITH CHECK (organization_id = auth_org_id() AND auth_has_role(ARRAY['editor', 'cost_analyst', 'procurement', 'approver', 'admin']));

-- ─── audit_log (C-11: append-only, no UPDATE or DELETE) ─────────────────────

-- OQ-05 resolved: SELECT restricted to admin and approver roles only.
CREATE POLICY "audit_log_select"
  ON audit_log FOR SELECT
  USING (
    organization_id = auth_org_id() AND
    auth_has_role(ARRAY['approver', 'admin'])
  );

-- Block UPDATE and DELETE for all roles including admin (immutability requirement).
CREATE POLICY "audit_log_no_update"
  ON audit_log FOR UPDATE
  USING (false);

CREATE POLICY "audit_log_no_delete"
  ON audit_log FOR DELETE
  USING (false);
