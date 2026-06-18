-- M-027: RLS for Inventory Valuation Context Framework
-- Pattern: org-isolation via auth_org_id() on direct tables.
-- Child tables (lines, filters, fx rates) use subquery via parent valuation_reports.

ALTER TABLE valuation_reports                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE valuation_report_warehouse_filters ENABLE ROW LEVEL SECURITY;
ALTER TABLE valuation_report_exchange_rates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE valuation_report_lines             ENABLE ROW LEVEL SECURITY;
ALTER TABLE corporate_exchange_rates           ENABLE ROW LEVEL SECURITY;

-- ─── valuation_reports ───────────────────────────────────────────────────────

CREATE POLICY "vr_select"
  ON valuation_reports FOR SELECT
  USING (organization_id = auth_org_id());

CREATE POLICY "vr_insert"
  ON valuation_reports FOR INSERT
  WITH CHECK (organization_id = auth_org_id());

CREATE POLICY "vr_update"
  ON valuation_reports FOR UPDATE
  USING (organization_id = auth_org_id());

-- Locked reports must not be deleted by users (engine writes; UI hides button)
-- No DELETE policy: locked/approved reports are immutable.

-- ─── valuation_report_warehouse_filters ──────────────────────────────────────

CREATE POLICY "vr_wf_select"
  ON valuation_report_warehouse_filters FOR SELECT
  USING (report_id IN (
    SELECT id FROM valuation_reports WHERE organization_id = auth_org_id()
  ));

CREATE POLICY "vr_wf_insert"
  ON valuation_report_warehouse_filters FOR INSERT
  WITH CHECK (report_id IN (
    SELECT id FROM valuation_reports WHERE organization_id = auth_org_id()
  ));

-- ─── valuation_report_exchange_rates ─────────────────────────────────────────

CREATE POLICY "vr_fx_select"
  ON valuation_report_exchange_rates FOR SELECT
  USING (report_id IN (
    SELECT id FROM valuation_reports WHERE organization_id = auth_org_id()
  ));

CREATE POLICY "vr_fx_insert"
  ON valuation_report_exchange_rates FOR INSERT
  WITH CHECK (report_id IN (
    SELECT id FROM valuation_reports WHERE organization_id = auth_org_id()
  ));

-- ─── valuation_report_lines ───────────────────────────────────────────────────

CREATE POLICY "vr_lines_select"
  ON valuation_report_lines FOR SELECT
  USING (report_id IN (
    SELECT id FROM valuation_reports WHERE organization_id = auth_org_id()
  ));

CREATE POLICY "vr_lines_insert"
  ON valuation_report_lines FOR INSERT
  WITH CHECK (report_id IN (
    SELECT id FROM valuation_reports WHERE organization_id = auth_org_id()
  ));

-- ─── corporate_exchange_rates ─────────────────────────────────────────────────

CREATE POLICY "corp_fx_select"
  ON corporate_exchange_rates FOR SELECT
  USING (organization_id = auth_org_id());

CREATE POLICY "corp_fx_insert"
  ON corporate_exchange_rates FOR INSERT
  WITH CHECK (organization_id = auth_org_id());

CREATE POLICY "corp_fx_update"
  ON corporate_exchange_rates FOR UPDATE
  USING (organization_id = auth_org_id());
