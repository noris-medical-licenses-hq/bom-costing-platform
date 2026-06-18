-- M-025: RLS policies for import tables + seed default field dictionary.
-- Uses the same auth_org_id() helper as all other tables in M-021.

-- ─── Enable RLS ───────────────────────────────────────────────────────────────

ALTER TABLE import_jobs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_templates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_template_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_job_rows          ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_field_dictionary  ENABLE ROW LEVEL SECURITY;

-- ─── import_jobs ──────────────────────────────────────────────────────────────

CREATE POLICY "import_jobs_select" ON import_jobs FOR SELECT
  USING (organization_id = auth_org_id());

CREATE POLICY "import_jobs_insert" ON import_jobs FOR INSERT
  WITH CHECK (organization_id = auth_org_id());

CREATE POLICY "import_jobs_update" ON import_jobs FOR UPDATE
  USING (organization_id = auth_org_id())
  WITH CHECK (organization_id = auth_org_id());

-- ─── import_templates ─────────────────────────────────────────────────────────

CREATE POLICY "import_templates_select" ON import_templates FOR SELECT
  USING (organization_id = auth_org_id());

CREATE POLICY "import_templates_insert" ON import_templates FOR INSERT
  WITH CHECK (organization_id = auth_org_id());

CREATE POLICY "import_templates_update" ON import_templates FOR UPDATE
  USING (organization_id = auth_org_id())
  WITH CHECK (organization_id = auth_org_id());

-- ─── import_template_mappings — via parent template ───────────────────────────

CREATE POLICY "import_template_mappings_select" ON import_template_mappings FOR SELECT
  USING (template_id IN (
    SELECT id FROM import_templates WHERE organization_id = auth_org_id()
  ));

CREATE POLICY "import_template_mappings_insert" ON import_template_mappings FOR INSERT
  WITH CHECK (template_id IN (
    SELECT id FROM import_templates WHERE organization_id = auth_org_id()
  ));

CREATE POLICY "import_template_mappings_delete" ON import_template_mappings FOR DELETE
  USING (template_id IN (
    SELECT id FROM import_templates WHERE organization_id = auth_org_id()
  ));

-- ─── import_job_rows — via parent job ─────────────────────────────────────────

CREATE POLICY "import_job_rows_select" ON import_job_rows FOR SELECT
  USING (import_job_id IN (
    SELECT id FROM import_jobs WHERE organization_id = auth_org_id()
  ));

CREATE POLICY "import_job_rows_insert" ON import_job_rows FOR INSERT
  WITH CHECK (import_job_id IN (
    SELECT id FROM import_jobs WHERE organization_id = auth_org_id()
  ));

-- ─── import_field_dictionary — org-specific OR global (org_id IS NULL) ────────

CREATE POLICY "import_field_dictionary_select" ON import_field_dictionary FOR SELECT
  USING (organization_id IS NULL OR organization_id = auth_org_id());

CREATE POLICY "import_field_dictionary_insert" ON import_field_dictionary FOR INSERT
  WITH CHECK (organization_id = auth_org_id());

CREATE POLICY "import_field_dictionary_update" ON import_field_dictionary FOR UPDATE
  USING (organization_id = auth_org_id())
  WITH CHECK (organization_id = auth_org_id());

-- ─── Seed global field dictionary (organization_id IS NULL) ───────────────────
-- Covers SKU, Description, Quantity, Cost, Parent SKU, Child SKU, Warehouse,
-- Site, Effective Date — in English and Hebrew.

INSERT INTO import_field_dictionary (import_type, source_alias, target_field, confidence) VALUES
-- ── SKU Master: sku ──
('sku_master','SKU',            'sku', 1.0),
('sku_master','Item Code',      'sku', 1.0),
('sku_master','Item',           'sku', 0.9),
('sku_master','Part Number',    'sku', 1.0),
('sku_master','Part No',        'sku', 0.9),
('sku_master','Catalog Number', 'sku', 0.9),
('sku_master','Product Code',   'sku', 0.9),
('sku_master','מקט',            'sku', 1.0),
('sku_master','מק"ט',           'sku', 1.0),
-- ── SKU Master: description ──
('sku_master','Description',      'description', 1.0),
('sku_master','Item Description', 'description', 1.0),
('sku_master','Product Name',     'description', 1.0),
('sku_master','Name',             'description', 0.8),
('sku_master','תאור',             'description', 1.0),
('sku_master','תיאור',            'description', 1.0),
-- ── SKU Master: family ──
('sku_master','Family',         'family', 1.0),
('sku_master','Product Family', 'family', 1.0),
('sku_master','Category',       'family', 0.8),
-- ── SKU Master: subfamily ──
('sku_master','Subfamily',      'subfamily', 1.0),
('sku_master','Sub Family',     'subfamily', 0.9),
('sku_master','Subcategory',    'subfamily', 0.8),
-- ── SKU Master: uom ──
('sku_master','UOM',              'uom', 1.0),
('sku_master','Unit',             'uom', 0.9),
('sku_master','Unit of Measure',  'uom', 1.0),
-- ── BOM Lines: parent_sku ──
('bom_lines','Parent',        'parent_sku', 1.0),
('bom_lines','Parent SKU',    'parent_sku', 1.0),
('bom_lines','Assembly',      'parent_sku', 0.9),
('bom_lines','Finished Good', 'parent_sku', 0.9),
('bom_lines','אב',            'parent_sku', 1.0),
-- ── BOM Lines: child_sku ──
('bom_lines','Child',         'child_sku', 1.0),
('bom_lines','Child SKU',     'child_sku', 1.0),
('bom_lines','Component',     'child_sku', 1.0),
('bom_lines','Material',      'child_sku', 0.9),
('bom_lines','בן',            'child_sku', 1.0),
('bom_lines','רכיב',          'child_sku', 1.0),
-- ── BOM Lines: quantity ──
('bom_lines','Qty',      'quantity', 1.0),
('bom_lines','Quantity', 'quantity', 1.0),
('bom_lines','Count',    'quantity', 0.8),
('bom_lines','כמות',     'quantity', 1.0),
-- ── Costs: sku ──
('costs','SKU',         'sku', 1.0),
('costs','Item Code',   'sku', 1.0),
('costs','Part Number', 'sku', 1.0),
('costs','Part No',     'sku', 0.9),
('costs','מקט',         'sku', 1.0),
('costs','מק"ט',        'sku', 1.0),
-- ── Costs: cost ──
('costs','Cost',           'cost', 1.0),
('costs','Unit Cost',      'cost', 1.0),
('costs','Std Cost',       'cost', 1.0),
('costs','Standard Cost',  'cost', 1.0),
('costs','Price',          'cost', 0.9),
('costs','Unit Price',     'cost', 0.9),
('costs','עלות',           'cost', 1.0),
('costs','מחיר',           'cost', 0.9),
-- ── Costs: cost_set ──
('costs','Cost Set',      'cost_set', 1.0),
('costs','Cost Set Name', 'cost_set', 1.0),
-- ── Costs: effective_date ──
('costs','Effective Date', 'effective_date', 1.0),
('costs','Date',           'effective_date', 0.8),
('costs','Valid From',     'effective_date', 0.9),
('costs','תאריך',          'effective_date', 1.0),
-- ── Costs: currency ──
('costs','Currency',  'currency', 1.0),
('costs','Ccy',       'currency', 0.9),
('costs','מטבע',      'currency', 1.0),
-- ── Inventory: sku ──
('inventory_snapshot','SKU',         'sku', 1.0),
('inventory_snapshot','Item',        'sku', 0.9),
('inventory_snapshot','Item Code',   'sku', 1.0),
('inventory_snapshot','Part Number', 'sku', 1.0),
('inventory_snapshot','מקט',         'sku', 1.0),
-- ── Inventory: quantity ──
('inventory_snapshot','Qty',         'quantity', 1.0),
('inventory_snapshot','Quantity',    'quantity', 1.0),
('inventory_snapshot','Stock Qty',   'quantity', 1.0),
('inventory_snapshot','Count',       'quantity', 0.8),
('inventory_snapshot','Counted Qty', 'quantity', 0.9),
('inventory_snapshot','כמות',        'quantity', 1.0),
-- ── Inventory: warehouse ──
('inventory_snapshot','Warehouse',   'warehouse', 1.0),
('inventory_snapshot','WH',          'warehouse', 1.0),
('inventory_snapshot','Location',    'warehouse', 0.8),
('inventory_snapshot','מחסן',        'warehouse', 1.0),
-- ── Inventory: site ──
('inventory_snapshot','Site',     'site', 1.0),
('inventory_snapshot','Plant',    'site', 0.9),
('inventory_snapshot','Facility', 'site', 0.8),
('inventory_snapshot','אתר',      'site', 1.0)
ON CONFLICT DO NOTHING;
