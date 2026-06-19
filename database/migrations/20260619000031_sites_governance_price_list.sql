-- ═══════════════════════════════════════════════════════════════════════════════
-- M-031: Sites Governance + Standard Price List Import Format
--
-- 1. Extends sites table with status lifecycle (active/archived/pending_delete/deleted)
--    and supplemental columns (default_currency, notes, deletion tracking).
-- 2. Extends audit_log CHECK constraint to include site governance event types.
-- 3. Adds import_field_definitions and synonyms for the new price_list import type,
--    including Hebrew synonyms for the standard non-Israel price list format.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Extend sites table ─────────────────────────────────────────────────────

ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS status            text        NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS default_currency  text        NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS notes             text,
  ADD COLUMN IF NOT EXISTS pending_delete_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at        timestamptz,
  ADD COLUMN IF NOT EXISTS delete_reason     text,
  ADD COLUMN IF NOT EXISTS archived_at       timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by       uuid        REFERENCES profiles(id);

-- Sync new status column with existing is_active boolean
UPDATE sites SET status = 'archived' WHERE is_active = false AND status = 'active';

ALTER TABLE sites ADD CONSTRAINT sites_status_check
  CHECK (status IN ('active', 'archived', 'pending_delete', 'deleted'));

-- ── 2. Extend audit_log event_type constraint ────────────────────────────────

ALTER TABLE audit_log
  DROP CONSTRAINT IF EXISTS audit_log_event_type_check;

ALTER TABLE audit_log
  ADD CONSTRAINT audit_log_event_type_check
  CHECK (event_type IN (
    'data_insert', 'data_update', 'data_delete',
    'bom_approved', 'bom_superseded',
    'snapshot_approved',
    'rule_activated', 'rule_deactivated',
    'exception_approved', 'exception_rejected',
    'calculation_executed', 'valuation_executed',
    'user_invited', 'user_role_changed', 'user_deactivated',
    'cost_set_locked', 'adjustment_approved',
    'site_archived', 'site_delete_requested', 'site_restored', 'site_deleted'
  ));

-- ── 3. Import field definitions — price_list type ─────────────────────────────

INSERT INTO import_field_definitions
  (import_type, field_key, display_name, description, data_type, field_category, required_by_default, sort_order)
VALUES
  ('price_list', 'part_number',  'Part Number',         'SKU code matching an existing SKU master record',           'text',    'core',       true,  10),
  ('price_list', 'description',  'Product Description', 'Item name or description (informational, not stored on SKU)', 'text',   'core',       false, 20),
  ('price_list', 'quantity',     'Quantity / Pack Size','Minimum order qty or pack size the price applies to',        'decimal', 'commercial', false, 30),
  ('price_list', 'unit_price',   'Unit Price',          'Price per unit in the list currency',                        'decimal', 'financial',  true,  40),
  ('price_list', 'currency',     'Currency',            'Per-line currency override (defaults to price list header)', 'text',    'financial',  false, 50)
ON CONFLICT (import_type, field_key) DO NOTHING;

-- ── 4. Synonyms — price_list (English + Hebrew) ───────────────────────────────

INSERT INTO import_field_synonyms (import_type, field_key, synonym, is_global)
VALUES
  -- part_number
  ('price_list', 'part_number', 'SKU',                  true),
  ('price_list', 'part_number', 'Item Number',           true),
  ('price_list', 'part_number', 'Item Code',             true),
  ('price_list', 'part_number', 'Part No',               true),
  ('price_list', 'part_number', 'Part#',                 true),
  ('price_list', 'part_number', 'Catalog Number',        true),
  ('price_list', 'part_number', 'מקט',                  true),
  ('price_list', 'part_number', 'קוד פריט',             true),
  -- description
  ('price_list', 'description', 'Product Description',   true),
  ('price_list', 'description', 'Item Description',      true),
  ('price_list', 'description', 'Description',           true),
  ('price_list', 'description', 'Name',                  true),
  ('price_list', 'description', 'Product Name',          true),
  ('price_list', 'description', 'תיאור מוצר',           true),
  ('price_list', 'description', 'תיאור',                true),
  -- quantity
  ('price_list', 'quantity',    'Qty',                   true),
  ('price_list', 'quantity',    'Quantity',               true),
  ('price_list', 'quantity',    'Pack Size',              true),
  ('price_list', 'quantity',    'MOQ',                   true),
  ('price_list', 'quantity',    'Min Qty',               true),
  ('price_list', 'quantity',    'כמות',                 true),
  -- unit_price
  ('price_list', 'unit_price',  'Price',                 true),
  ('price_list', 'unit_price',  'Unit Price',            true),
  ('price_list', 'unit_price',  'List Price',            true),
  ('price_list', 'unit_price',  'Net Price',             true),
  ('price_list', 'unit_price',  'Sale Price',            true),
  ('price_list', 'unit_price',  'מחיר',                 true),
  ('price_list', 'unit_price',  'מחיר יחידה',           true),
  -- currency
  ('price_list', 'currency',    'Currency',              true),
  ('price_list', 'currency',    'Ccy',                   true),
  ('price_list', 'currency',    'מטבע',                 true)
ON CONFLICT DO NOTHING;
