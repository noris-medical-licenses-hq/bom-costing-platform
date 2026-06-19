-- M-036: purchase_history
-- Imported ERP purchase records for LAST_PURCHASE and AVERAGE_PURCHASE costing strategies.
-- Records are immutable after insert — corrections are new rows, not updates.
-- Supplier is nullable: ERP data may reference vendors not yet in the platform.

CREATE TABLE IF NOT EXISTS purchase_history (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL,
  site_id          uuid        NOT NULL,
  sku_id           uuid        NOT NULL,
  supplier_id      uuid        NULL,
  purchase_date    date        NOT NULL,
  quantity         numeric     NOT NULL,
  unit_cost        numeric     NOT NULL,
  currency         text        NOT NULL,
  source_system    text        NULL,
  source_reference text        NULL,
  import_job_id    uuid        NULL,
  created_by       uuid        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT purchase_history_pkey
    PRIMARY KEY (id),
  CONSTRAINT purchase_history_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT purchase_history_site_id_fkey
    FOREIGN KEY (site_id) REFERENCES sites(id),
  CONSTRAINT purchase_history_sku_id_fkey
    FOREIGN KEY (sku_id) REFERENCES skus(id),
  CONSTRAINT purchase_history_supplier_id_fkey
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  CONSTRAINT purchase_history_import_job_id_fkey
    FOREIGN KEY (import_job_id) REFERENCES import_jobs(id),
  CONSTRAINT purchase_history_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id),
  CONSTRAINT purchase_history_quantity_check
    CHECK (quantity > 0),
  CONSTRAINT purchase_history_unit_cost_check
    CHECK (unit_cost >= 0),
  CONSTRAINT purchase_history_currency_check
    CHECK (char_length(currency) = 3)
);

COMMENT ON TABLE purchase_history IS
  'Imported purchase records from ERP systems. Used by LAST_PURCHASE and AVERAGE_PURCHASE '
  'costing strategies. Immutable — corrections are new rows.';

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE purchase_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY purchase_history_select ON purchase_history
  FOR SELECT USING (organization_id = auth_org_id());

CREATE POLICY purchase_history_insert ON purchase_history
  FOR INSERT WITH CHECK (
    organization_id = auth_org_id()
    AND auth_has_role(ARRAY['procurement', 'cost_analyst', 'admin'])
  );

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- LAST_PURCHASE strategy: fetches latest non-zero cost record per SKU+site
CREATE INDEX IF NOT EXISTS idx_purchase_history_sku_site_date
  ON purchase_history (organization_id, sku_id, site_id, purchase_date DESC)
  WHERE unit_cost > 0;

-- AVERAGE_PURCHASE strategy: currency-scoped lookback window scan
CREATE INDEX IF NOT EXISTS idx_purchase_history_sku_site_currency
  ON purchase_history (organization_id, sku_id, site_id, currency, purchase_date DESC)
  WHERE unit_cost > 0;

-- Admin: purge or audit by import job
CREATE INDEX IF NOT EXISTS idx_purchase_history_import_job
  ON purchase_history (import_job_id)
  WHERE import_job_id IS NOT NULL;

-- Org-level list and reporting queries
CREATE INDEX IF NOT EXISTS idx_purchase_history_org
  ON purchase_history (organization_id, purchase_date DESC);

-- ── Import field definitions ─────────────────────────────────────────────────
-- Registers purchase_history fields in the import catalog so the UI mapping
-- dropdown is populated correctly for this import type.

INSERT INTO import_field_definitions
  (import_type, field_key, display_name, description, data_type, field_category, required_by_default, is_system, is_deprecated, sort_order, active)
VALUES
  ('purchase_history', 'sku_part_number', 'Part Number',       'Must match an existing SKU in the system',       'text',    'core',      true,  true, false, 10, true),
  ('purchase_history', 'purchase_date',   'Purchase Date',     'Date of purchase (YYYY-MM-DD)',                  'date',    'core',      true,  true, false, 20, true),
  ('purchase_history', 'quantity',        'Quantity',          'Units purchased (must be positive)',             'decimal', 'core',      true,  true, false, 30, true),
  ('purchase_history', 'unit_cost',       'Unit Cost',         'Price per unit (0 = zero-cost / sample)',        'decimal', 'core',      true,  true, false, 40, true),
  ('purchase_history', 'currency',        'Currency',          '3-letter ISO currency code (EUR, USD, GBP…)',   'text',    'core',      true,  true, false, 50, true),
  ('purchase_history', 'site_code',       'Site Code',         'Must match sites.code in the system',            'text',    'core',      false, true, false, 60, true),
  ('purchase_history', 'supplier_code',   'Supplier Code',     'Must match suppliers.code (optional)',           'text',    'supplier',  false, true, false, 70, true),
  ('purchase_history', 'source_system',   'Source System',     'ERP system name (SAP, Oracle, Navision…)',      'text',    'source',    false, true, false, 80, true),
  ('purchase_history', 'source_reference','Source Reference',  'ERP document reference (PO number, line ID…)', 'text',    'source',    false, true, false, 90, true)
ON CONFLICT DO NOTHING;

-- Auto-mapping synonyms for purchase_history columns
INSERT INTO import_field_synonyms
  (import_type, field_key, synonym, is_global)
VALUES
  ('purchase_history', 'sku_part_number', 'Part Number',      true),
  ('purchase_history', 'sku_part_number', 'SKU',              true),
  ('purchase_history', 'sku_part_number', 'Article',          true),
  ('purchase_history', 'sku_part_number', 'Item',             true),
  ('purchase_history', 'sku_part_number', 'Material',         true),
  ('purchase_history', 'purchase_date',   'Purchase Date',    true),
  ('purchase_history', 'purchase_date',   'Order Date',       true),
  ('purchase_history', 'purchase_date',   'Date',             true),
  ('purchase_history', 'quantity',        'Qty',              true),
  ('purchase_history', 'quantity',        'Ordered Qty',      true),
  ('purchase_history', 'unit_cost',       'Price',            true),
  ('purchase_history', 'unit_cost',       'Unit Price',       true),
  ('purchase_history', 'unit_cost',       'Cost',             true),
  ('purchase_history', 'unit_cost',       'Net Price',        true),
  ('purchase_history', 'currency',        'Curr',             true),
  ('purchase_history', 'site_code',       'Site',             true),
  ('purchase_history', 'site_code',       'Plant',            true),
  ('purchase_history', 'supplier_code',   'Vendor',           true),
  ('purchase_history', 'supplier_code',   'Supplier',         true),
  ('purchase_history', 'source_system',   'System',           true),
  ('purchase_history', 'source_reference','PO Number',        true),
  ('purchase_history', 'source_reference','Reference',        true),
  ('purchase_history', 'source_reference','Document',         true)
ON CONFLICT DO NOTHING;
