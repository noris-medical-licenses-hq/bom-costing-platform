-- BOM Costing Platform — Demo Seed Data
-- Realistic Noris Medical window/door manufacturing scenario
-- Run against your Supabase project: supabase db push --local (or paste in SQL editor)
-- All UUIDs are deterministic for repeatability.
-- IMPORTANT: Replace org_id and user_id placeholders with real values from your org.

-- ─── Configuration ────────────────────────────────────────────────────────────
-- Set these to match your environment:
-- org_id:  The organization UUID from the organizations table
-- user_id: A user UUID from auth.users / profiles

\set org_id   'ORG_UUID_PLACEHOLDER'
\set user_id  'USER_UUID_PLACEHOLDER'

-- ─── Families ─────────────────────────────────────────────────────────────────

INSERT INTO families (id, organization_id, family_code, family_name, created_at, updated_at)
VALUES
  ('fam-11111111-0000-0000-0000-000000000001', :'org_id', 'WIN', 'Windows',  now(), now()),
  ('fam-11111111-0000-0000-0000-000000000002', :'org_id', 'DOR', 'Doors',    now(), now()),
  ('fam-11111111-0000-0000-0000-000000000003', :'org_id', 'PRF', 'Profiles', now(), now()),
  ('fam-11111111-0000-0000-0000-000000000004', :'org_id', 'GLS', 'Glass',    now(), now())
ON CONFLICT (id) DO NOTHING;

-- ─── Subfamilies ──────────────────────────────────────────────────────────────

INSERT INTO subfamilies (id, organization_id, family_id, subfamily_code, subfamily_name, created_at, updated_at)
VALUES
  ('sub-11111111-0000-0000-0000-000000000001', :'org_id', 'fam-11111111-0000-0000-0000-000000000003', 'PVC', 'PVC Profiles',       now(), now()),
  ('sub-11111111-0000-0000-0000-000000000002', :'org_id', 'fam-11111111-0000-0000-0000-000000000003', 'ALU', 'Aluminum Profiles',  now(), now()),
  ('sub-11111111-0000-0000-0000-000000000003', :'org_id', 'fam-11111111-0000-0000-0000-000000000001', 'DBL', 'Double Glazed',      now(), now()),
  ('sub-11111111-0000-0000-0000-000000000004', :'org_id', 'fam-11111111-0000-0000-0000-000000000001', 'TRP', 'Triple Glazed',      now(), now()),
  ('sub-11111111-0000-0000-0000-000000000005', :'org_id', 'fam-11111111-0000-0000-0000-000000000004', 'CLR', 'Clear Glass',        now(), now()),
  ('sub-11111111-0000-0000-0000-000000000006', :'org_id', 'fam-11111111-0000-0000-0000-000000000004', 'LAM', 'Laminated Glass',    now(), now())
ON CONFLICT (id) DO NOTHING;

-- ─── Suppliers ────────────────────────────────────────────────────────────────

INSERT INTO suppliers (id, organization_id, supplier_code, supplier_name, country, status, created_at, updated_at)
VALUES
  ('sup-11111111-0000-0000-0000-000000000001', :'org_id', 'REHAU-DE', 'REHAU GmbH',             'DE', 'active', now(), now()),
  ('sup-11111111-0000-0000-0000-000000000002', :'org_id', 'SAINT-FR', 'Saint-Gobain Glass',      'FR', 'active', now(), now()),
  ('sup-11111111-0000-0000-0000-000000000003', :'org_id', 'TREMCO-NL','Tremco CPG Netherlands',  'NL', 'active', now(), now()),
  ('sup-11111111-0000-0000-0000-000000000004', :'org_id', 'EDGETECH', 'Edgetech Europe GmbH',    'DE', 'active', now(), now())
ON CONFLICT (id) DO NOTHING;

-- ─── SKUs — Raw Materials ─────────────────────────────────────────────────────

INSERT INTO skus (id, organization_id, part_number, name, item_type, make_buy, unit_of_measure,
                  status, family_id, subfamily_id, supplier_id, lead_time_days, created_at, updated_at, created_by, updated_by)
VALUES
  -- PVC Profiles
  ('sku-11111111-0000-0000-0000-000000000001', :'org_id',
   'PRF-PVC-080', 'PVC Profile 80mm White', 'purchased_part', 'buy', 'lm',
   'active', 'fam-11111111-0000-0000-0000-000000000003', 'sub-11111111-0000-0000-0000-000000000001',
   'sup-11111111-0000-0000-0000-000000000001', 7, now(), now(), :'user_id', :'user_id'),

  ('sku-11111111-0000-0000-0000-000000000002', :'org_id',
   'PRF-PVC-060', 'PVC Profile 60mm White', 'purchased_part', 'buy', 'lm',
   'active', 'fam-11111111-0000-0000-0000-000000000003', 'sub-11111111-0000-0000-0000-000000000001',
   'sup-11111111-0000-0000-0000-000000000001', 7, now(), now(), :'user_id', :'user_id'),

  -- Glass Units
  ('sku-11111111-0000-0000-0000-000000000003', :'org_id',
   'GLS-DBL-4-16-4', 'Double Glazed Unit 4-16-4 Clear', 'purchased_part', 'buy', 'm2',
   'active', 'fam-11111111-0000-0000-0000-000000000004', 'sub-11111111-0000-0000-0000-000000000005',
   'sup-11111111-0000-0000-0000-000000000002', 10, now(), now(), :'user_id', :'user_id'),

  ('sku-11111111-0000-0000-0000-000000000004', :'org_id',
   'GLS-TRP-4-12-4-12-4', 'Triple Glazed Unit 4-12-4-12-4 Low-E', 'purchased_part', 'buy', 'm2',
   'active', 'fam-11111111-0000-0000-0000-000000000004', 'sub-11111111-0000-0000-0000-000000000006',
   'sup-11111111-0000-0000-0000-000000000002', 14, now(), now(), :'user_id', :'user_id'),

  -- Seals and Hardware
  ('sku-11111111-0000-0000-0000-000000000005', :'org_id',
   'SEL-EPDM-MAIN', 'EPDM Main Seal per meter', 'purchased_part', 'buy', 'lm',
   'active', null, null,
   'sup-11111111-0000-0000-0000-000000000003', 5, now(), now(), :'user_id', :'user_id'),

  ('sku-11111111-0000-0000-0000-000000000006', :'org_id',
   'SEL-EPDM-GLAZ', 'EPDM Glazing Seal per meter', 'purchased_part', 'buy', 'lm',
   'active', null, null,
   'sup-11111111-0000-0000-0000-000000000003', 5, now(), now(), :'user_id', :'user_id'),

  ('sku-11111111-0000-0000-0000-000000000007', :'org_id',
   'SPC-WARM-EDGE', 'Warm Edge Spacer per meter', 'purchased_part', 'buy', 'lm',
   'active', null, null,
   'sup-11111111-0000-0000-0000-000000000004', 7, now(), now(), :'user_id', :'user_id'),

  -- Sub-assemblies (make items with BOMs)
  ('sku-11111111-0000-0000-0000-000000000010', :'org_id',
   'FRM-WND-080-DBL', 'Window Frame 80mm PVC Double Glaze', 'sub_assembly', 'make', 'pcs',
   'active', 'fam-11111111-0000-0000-0000-000000000003', 'sub-11111111-0000-0000-0000-000000000001',
   null, 2, now(), now(), :'user_id', :'user_id'),

  -- Finished goods
  ('sku-11111111-0000-0000-0000-000000000020', :'org_id',
   'WND-CASEMENT-080-DBL', 'Casement Window 80mm PVC 1200x1000 Double', 'finished_good', 'make', 'pcs',
   'active', 'fam-11111111-0000-0000-0000-000000000001', 'sub-11111111-0000-0000-0000-000000000003',
   null, 3, now(), now(), :'user_id', :'user_id'),

  ('sku-11111111-0000-0000-0000-000000000021', :'org_id',
   'WND-CASEMENT-080-TRP', 'Casement Window 80mm PVC 1200x1000 Triple', 'finished_good', 'make', 'pcs',
   'active', 'fam-11111111-0000-0000-0000-000000000001', 'sub-11111111-0000-0000-0000-000000000004',
   null, 3, now(), now(), :'user_id', :'user_id')
ON CONFLICT (id) DO NOTHING;

-- ─── Supplier Prices ──────────────────────────────────────────────────────────

INSERT INTO supplier_prices (id, organization_id, sku_id, supplier_id, unit_price, currency,
                              effective_from, effective_to, created_at, updated_at)
VALUES
  ('spr-11111111-0000-0000-0000-000000000001', :'org_id',
   'sku-11111111-0000-0000-0000-000000000001', 'sup-11111111-0000-0000-0000-000000000001',
   3.20, 'EUR', '2024-01-01', null, now(), now()),

  ('spr-11111111-0000-0000-0000-000000000002', :'org_id',
   'sku-11111111-0000-0000-0000-000000000002', 'sup-11111111-0000-0000-0000-000000000001',
   2.60, 'EUR', '2024-01-01', null, now(), now()),

  ('spr-11111111-0000-0000-0000-000000000003', :'org_id',
   'sku-11111111-0000-0000-0000-000000000003', 'sup-11111111-0000-0000-0000-000000000002',
   28.50, 'EUR', '2024-01-01', null, now(), now()),

  ('spr-11111111-0000-0000-0000-000000000004', :'org_id',
   'sku-11111111-0000-0000-0000-000000000004', 'sup-11111111-0000-0000-0000-000000000002',
   42.00, 'EUR', '2024-01-01', null, now(), now()),

  ('spr-11111111-0000-0000-0000-000000000005', :'org_id',
   'sku-11111111-0000-0000-0000-000000000005', 'sup-11111111-0000-0000-0000-000000000003',
   0.45, 'EUR', '2024-01-01', null, now(), now()),

  ('spr-11111111-0000-0000-0000-000000000006', :'org_id',
   'sku-11111111-0000-0000-0000-000000000006', 'sup-11111111-0000-0000-0000-000000000003',
   0.38, 'EUR', '2024-01-01', null, now(), now()),

  ('spr-11111111-0000-0000-0000-000000000007', :'org_id',
   'sku-11111111-0000-0000-0000-000000000007', 'sup-11111111-0000-0000-0000-000000000004',
   1.20, 'EUR', '2024-01-01', null, now(), now())
ON CONFLICT (id) DO NOTHING;

-- ─── BOMs ────────────────────────────────────────────────────────────────────

INSERT INTO boms (id, organization_id, sku_id, created_at, updated_at, created_by, updated_by)
VALUES
  ('bom-11111111-0000-0000-0000-000000000001', :'org_id',
   'sku-11111111-0000-0000-0000-000000000010', now(), now(), :'user_id', :'user_id'),

  ('bom-11111111-0000-0000-0000-000000000002', :'org_id',
   'sku-11111111-0000-0000-0000-000000000020', now(), now(), :'user_id', :'user_id'),

  ('bom-11111111-0000-0000-0000-000000000003', :'org_id',
   'sku-11111111-0000-0000-0000-000000000021', now(), now(), :'user_id', :'user_id')
ON CONFLICT (id) DO NOTHING;

-- ─── BOM Versions ─────────────────────────────────────────────────────────────

INSERT INTO bom_versions (id, bom_id, version_number, status, effective_date, approved_by, approved_at, created_at, updated_at, created_by, updated_by)
VALUES
  ('bmv-11111111-0000-0000-0000-000000000001', 'bom-11111111-0000-0000-0000-000000000001',
   1, 'approved', '2024-01-01', :'user_id', now(), now(), now(), :'user_id', :'user_id'),

  ('bmv-11111111-0000-0000-0000-000000000002', 'bom-11111111-0000-0000-0000-000000000002',
   1, 'approved', '2024-01-01', :'user_id', now(), now(), now(), :'user_id', :'user_id'),

  ('bmv-11111111-0000-0000-0000-000000000003', 'bom-11111111-0000-0000-0000-000000000003',
   1, 'approved', '2024-01-01', :'user_id', now(), now(), now(), :'user_id', :'user_id')
ON CONFLICT (id) DO NOTHING;

-- ─── BOM Lines — Frame sub-assembly ──────────────────────────────────────────
-- FRM-WND-080-DBL: 4.4m PVC 80mm + 0.8m PVC 60mm (rebate) + 3.2m main seal + 3.2m glaze seal

INSERT INTO bom_lines (id, bom_version_id, sku_id, quantity, depth, parent_line_id, unit_of_measure, scrap_rate, created_at, updated_at, created_by, updated_by)
VALUES
  ('bln-11111111-0000-0000-0000-000000000101', 'bmv-11111111-0000-0000-0000-000000000001',
   'sku-11111111-0000-0000-0000-000000000001', 4.4, 1, null, 'lm', 0.05, now(), now(), :'user_id', :'user_id'),

  ('bln-11111111-0000-0000-0000-000000000102', 'bmv-11111111-0000-0000-0000-000000000001',
   'sku-11111111-0000-0000-0000-000000000002', 0.8, 1, null, 'lm', 0.05, now(), now(), :'user_id', :'user_id'),

  ('bln-11111111-0000-0000-0000-000000000103', 'bmv-11111111-0000-0000-0000-000000000001',
   'sku-11111111-0000-0000-0000-000000000005', 3.2, 1, null, 'lm', 0.03, now(), now(), :'user_id', :'user_id'),

  ('bln-11111111-0000-0000-0000-000000000104', 'bmv-11111111-0000-0000-0000-000000000001',
   'sku-11111111-0000-0000-0000-000000000006', 3.2, 1, null, 'lm', 0.03, now(), now(), :'user_id', :'user_id')
ON CONFLICT (id) DO NOTHING;

-- ─── BOM Lines — Double-glazed window (FG) ───────────────────────────────────
-- WND-CASEMENT-080-DBL: 1x frame sub-assembly + 1.08m2 double glaze + 3.4m spacer

INSERT INTO bom_lines (id, bom_version_id, sku_id, quantity, depth, parent_line_id, unit_of_measure, scrap_rate, created_at, updated_at, created_by, updated_by)
VALUES
  ('bln-11111111-0000-0000-0000-000000000201', 'bmv-11111111-0000-0000-0000-000000000002',
   'sku-11111111-0000-0000-0000-000000000010', 1, 1, null, 'pcs', 0, now(), now(), :'user_id', :'user_id'),

  ('bln-11111111-0000-0000-0000-000000000202', 'bmv-11111111-0000-0000-0000-000000000002',
   'sku-11111111-0000-0000-0000-000000000003', 1.08, 1, null, 'm2', 0.02, now(), now(), :'user_id', :'user_id'),

  ('bln-11111111-0000-0000-0000-000000000203', 'bmv-11111111-0000-0000-0000-000000000002',
   'sku-11111111-0000-0000-0000-000000000007', 3.4, 1, null, 'lm', 0.03, now(), now(), :'user_id', :'user_id')
ON CONFLICT (id) DO NOTHING;

-- ─── BOM Lines — Triple-glazed window (FG) ───────────────────────────────────
-- WND-CASEMENT-080-TRP: 1x frame + 1.08m2 triple glaze + 6.8m spacer (two panes)

INSERT INTO bom_lines (id, bom_version_id, sku_id, quantity, depth, parent_line_id, unit_of_measure, scrap_rate, created_at, updated_at, created_by, updated_by)
VALUES
  ('bln-11111111-0000-0000-0000-000000000301', 'bmv-11111111-0000-0000-0000-000000000003',
   'sku-11111111-0000-0000-0000-000000000010', 1, 1, null, 'pcs', 0, now(), now(), :'user_id', :'user_id'),

  ('bln-11111111-0000-0000-0000-000000000302', 'bmv-11111111-0000-0000-0000-000000000003',
   'sku-11111111-0000-0000-0000-000000000004', 1.08, 1, null, 'm2', 0.02, now(), now(), :'user_id', :'user_id'),

  ('bln-11111111-0000-0000-0000-000000000303', 'bmv-11111111-0000-0000-0000-000000000003',
   'sku-11111111-0000-0000-0000-000000000007', 6.8, 1, null, 'lm', 0.03, now(), now(), :'user_id', :'user_id')
ON CONFLICT (id) DO NOTHING;

-- ─── Sites and Warehouses ─────────────────────────────────────────────────────

INSERT INTO sites (id, organization_id, site_code, site_name, country, is_active, created_at, updated_at)
VALUES
  ('sit-11111111-0000-0000-0000-000000000001', :'org_id', 'BERLIN',  'Berlin Plant',  'DE', true, now(), now()),
  ('sit-11111111-0000-0000-0000-000000000002', :'org_id', 'MUNICH',  'Munich Plant',  'DE', true, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO warehouses (id, organization_id, site_id, warehouse_code, warehouse_name, is_active, created_at, updated_at)
VALUES
  ('whs-11111111-0000-0000-0000-000000000001', :'org_id',
   'sit-11111111-0000-0000-0000-000000000001', 'BER-WH1', 'Berlin Raw Materials', true, now(), now()),
  ('whs-11111111-0000-0000-0000-000000000002', :'org_id',
   'sit-11111111-0000-0000-0000-000000000001', 'BER-WH2', 'Berlin Finished Goods', true, now(), now()),
  ('whs-11111111-0000-0000-0000-000000000003', :'org_id',
   'sit-11111111-0000-0000-0000-000000000002', 'MUN-WH1', 'Munich Production',    true, now(), now())
ON CONFLICT (id) DO NOTHING;

-- ─── Cost Sets ────────────────────────────────────────────────────────────────

INSERT INTO cost_sets (id, organization_id, cost_set_name, cost_set_type, status,
                       base_currency, valid_from, valid_to, created_at, updated_at, created_by, updated_by)
VALUES
  ('cst-11111111-0000-0000-0000-000000000001', :'org_id',
   'Berlin 2024 Standard Cost', 'standard', 'active',
   'EUR', '2024-01-01', '2024-12-31', now(), now(), :'user_id', :'user_id'),

  ('cst-11111111-0000-0000-0000-000000000002', :'org_id',
   'Munich 2024 Standard Cost', 'standard', 'active',
   'EUR', '2024-01-01', '2024-12-31', now(), now(), :'user_id', :'user_id'),

  ('cst-11111111-0000-0000-0000-000000000003', :'org_id',
   'Project X Premium Cost', 'project', 'active',
   'EUR', '2024-06-01', null, now(), now(), :'user_id', :'user_id')
ON CONFLICT (id) DO NOTHING;

-- ─── Cost Items — Berlin 2024 ─────────────────────────────────────────────────

INSERT INTO cost_items (id, cost_set_id, item_type, scope_type, scope_id, value, currency,
                        effective_from, effective_to, created_at, updated_at, created_by, updated_by)
VALUES
  -- Global overhead 12%
  ('cit-11111111-0000-0000-0000-000000000001', 'cst-11111111-0000-0000-0000-000000000001',
   'overhead_pct', 'global', null, 12.0, null, '2024-01-01', null, now(), now(), :'user_id', :'user_id'),

  -- Family-level mark-up: Windows +8%
  ('cit-11111111-0000-0000-0000-000000000002', 'cst-11111111-0000-0000-0000-000000000001',
   'overhead_pct', 'family', 'fam-11111111-0000-0000-0000-000000000001', 8.0, null, '2024-01-01', null, now(), now(), :'user_id', :'user_id'),

  -- SKU-level overrides: PVC Profile 80mm
  ('cit-11111111-0000-0000-0000-000000000003', 'cst-11111111-0000-0000-0000-000000000001',
   'material', 'sku', 'sku-11111111-0000-0000-0000-000000000001', 3.10, 'EUR', '2024-01-01', null, now(), now(), :'user_id', :'user_id'),

  -- SKU-level: Double-glazed unit (volume discount)
  ('cit-11111111-0000-0000-0000-000000000004', 'cst-11111111-0000-0000-0000-000000000001',
   'material', 'sku', 'sku-11111111-0000-0000-0000-000000000003', 26.80, 'EUR', '2024-01-01', null, now(), now(), :'user_id', :'user_id'),

  -- SKU-level: Triple-glazed unit
  ('cit-11111111-0000-0000-0000-000000000005', 'cst-11111111-0000-0000-0000-000000000001',
   'material', 'sku', 'sku-11111111-0000-0000-0000-000000000004', 39.50, 'EUR', '2024-01-01', null, now(), now(), :'user_id', :'user_id')
ON CONFLICT (id) DO NOTHING;

-- ─── Cost Items — Munich 2024 (slightly different rates) ─────────────────────

INSERT INTO cost_items (id, cost_set_id, item_type, scope_type, scope_id, value, currency,
                        effective_from, effective_to, created_at, updated_at, created_by, updated_by)
VALUES
  ('cit-11111111-0000-0000-0000-000000000011', 'cst-11111111-0000-0000-0000-000000000002',
   'overhead_pct', 'global', null, 14.0, null, '2024-01-01', null, now(), now(), :'user_id', :'user_id'),

  ('cit-11111111-0000-0000-0000-000000000012', 'cst-11111111-0000-0000-0000-000000000002',
   'material', 'sku', 'sku-11111111-0000-0000-0000-000000000001', 3.25, 'EUR', '2024-01-01', null, now(), now(), :'user_id', :'user_id'),

  ('cit-11111111-0000-0000-0000-000000000013', 'cst-11111111-0000-0000-0000-000000000002',
   'material', 'sku', 'sku-11111111-0000-0000-0000-000000000003', 27.50, 'EUR', '2024-01-01', null, now(), now(), :'user_id', :'user_id')
ON CONFLICT (id) DO NOTHING;

-- ─── Cost Rules ───────────────────────────────────────────────────────────────

INSERT INTO cost_rules (id, organization_id, rule_name, rule_description, priority, is_active, created_at, updated_at, created_by, updated_by)
VALUES
  ('rul-11111111-0000-0000-0000-000000000001', :'org_id',
   'Window Family Premium', 'Add 5% mark-up for all Window family SKUs', 10, true,
   now(), now(), :'user_id', :'user_id'),

  ('rul-11111111-0000-0000-0000-000000000002', :'org_id',
   'Triple Glaze Cap', 'Cap triple glazing unit cost at 50 EUR/m2', 20, true,
   now(), now(), :'user_id', :'user_id'),

  ('rul-11111111-0000-0000-0000-000000000003', :'org_id',
   'Discontinued SKU Exclude', 'Exclude discontinued SKUs from rollup', 99, false,
   now(), now(), :'user_id', :'user_id')
ON CONFLICT (id) DO NOTHING;

-- ─── Rule Conditions ──────────────────────────────────────────────────────────

INSERT INTO rule_conditions (id, rule_id, condition_field, condition_operator, condition_value, logical_group, created_at)
VALUES
  ('rcd-11111111-0000-0000-0000-000000000001', 'rul-11111111-0000-0000-0000-000000000001',
   'sku.family_id', 'equals', 'fam-11111111-0000-0000-0000-000000000001', 1, now()),

  ('rcd-11111111-0000-0000-0000-000000000002', 'rul-11111111-0000-0000-0000-000000000002',
   'sku.item_type', 'equals', 'purchased_part', 1, now()),

  ('rcd-11111111-0000-0000-0000-000000000003', 'rul-11111111-0000-0000-0000-000000000002',
   'sku.subfamily_id', 'equals', 'sub-11111111-0000-0000-0000-000000000006', 1, now())
ON CONFLICT (id) DO NOTHING;

-- ─── Rule Actions ─────────────────────────────────────────────────────────────

INSERT INTO rule_actions (id, rule_id, action_type, action_value, created_at)
VALUES
  ('rac-11111111-0000-0000-0000-000000000001', 'rul-11111111-0000-0000-0000-000000000001',
   'add_percentage', 5.0, now()),

  ('rac-11111111-0000-0000-0000-000000000002', 'rul-11111111-0000-0000-0000-000000000002',
   'cap_at_value', 50.0, now())
ON CONFLICT (id) DO NOTHING;

-- ─── Summary comment ─────────────────────────────────────────────────────────
-- Seeded:
--   4 families: WINDOW, DOOR, PROFILE, GLASS
--   6 subfamilies: PVC, ALU, DBL, TRP, CLR, LAM
--   4 suppliers: REHAU, Saint-Gobain, Tremco, Edgetech
--  10 SKUs: 7 purchased parts, 1 sub-assembly, 2 finished goods
--   7 supplier prices (all in EUR)
--   3 BOMs (frame sub-assembly, double-glaze FG, triple-glaze FG)
--   3 BOM versions (all approved)
--  10 BOM lines across 3 BOMs
--   2 sites (Berlin, Munich), 3 warehouses
--   3 cost sets (Berlin 2024, Munich 2024, Project X)
--   8 cost items across cost sets
--   3 cost rules (window premium +5%, triple-glaze cap €50, inactive)
--   3 rule conditions, 2 rule actions
