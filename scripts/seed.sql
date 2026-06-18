-- BOM Costing Platform — Demo Seed Data
-- Realistic Noris Medical window/door manufacturing scenario
-- Run via: npm run apply-seed (requires ORG_ID and USER_ID env vars)
-- All UUIDs are deterministic for repeatability.
-- PREREQUISITE: The org and user profile for USER_ID must already exist (created by Supabase auth setup).
-- All inserts use ON CONFLICT (id) DO NOTHING — safe to run multiple times.

-- ─── Configuration ────────────────────────────────────────────────────────────
-- org_id:  The organization UUID from the organizations table
-- user_id: A profile UUID from profiles (must exist before this seed runs)
-- Set via psql variables: psql -v org_id="..." -v user_id="..."

\set org_id   :'org_id'
\set user_id  :'user_id'

-- ─── Families ─────────────────────────────────────────────────────────────────

INSERT INTO families (id, organization_id, code, name, created_by, updated_by, created_at, updated_at)
VALUES
  ('fam-11111111-0000-0000-0000-000000000001', :'org_id', 'WIN', 'Windows',  :'user_id', :'user_id', now(), now()),
  ('fam-11111111-0000-0000-0000-000000000002', :'org_id', 'DOR', 'Doors',    :'user_id', :'user_id', now(), now()),
  ('fam-11111111-0000-0000-0000-000000000003', :'org_id', 'PRF', 'Profiles', :'user_id', :'user_id', now(), now()),
  ('fam-11111111-0000-0000-0000-000000000004', :'org_id', 'GLS', 'Glass',    :'user_id', :'user_id', now(), now())
ON CONFLICT (id) DO NOTHING;

-- ─── Subfamilies ──────────────────────────────────────────────────────────────

INSERT INTO subfamilies (id, organization_id, family_id, code, name, created_by, updated_by, created_at, updated_at)
VALUES
  ('sub-11111111-0000-0000-0000-000000000001', :'org_id', 'fam-11111111-0000-0000-0000-000000000003', 'PVC', 'PVC Profiles',      :'user_id', :'user_id', now(), now()),
  ('sub-11111111-0000-0000-0000-000000000002', :'org_id', 'fam-11111111-0000-0000-0000-000000000003', 'ALU', 'Aluminum Profiles', :'user_id', :'user_id', now(), now()),
  ('sub-11111111-0000-0000-0000-000000000003', :'org_id', 'fam-11111111-0000-0000-0000-000000000001', 'DBL', 'Double Glazed',     :'user_id', :'user_id', now(), now()),
  ('sub-11111111-0000-0000-0000-000000000004', :'org_id', 'fam-11111111-0000-0000-0000-000000000001', 'TRP', 'Triple Glazed',     :'user_id', :'user_id', now(), now()),
  ('sub-11111111-0000-0000-0000-000000000005', :'org_id', 'fam-11111111-0000-0000-0000-000000000004', 'CLR', 'Clear Glass',       :'user_id', :'user_id', now(), now()),
  ('sub-11111111-0000-0000-0000-000000000006', :'org_id', 'fam-11111111-0000-0000-0000-000000000004', 'LAM', 'Laminated Glass',   :'user_id', :'user_id', now(), now())
ON CONFLICT (id) DO NOTHING;

-- ─── Suppliers ────────────────────────────────────────────────────────────────

INSERT INTO suppliers (id, organization_id, code, name, country, status, created_by, updated_by, created_at, updated_at)
VALUES
  ('sup-11111111-0000-0000-0000-000000000001', :'org_id', 'REHAU-DE',  'REHAU GmbH',            'DE', 'active', :'user_id', :'user_id', now(), now()),
  ('sup-11111111-0000-0000-0000-000000000002', :'org_id', 'SAINT-FR',  'Saint-Gobain Glass',    'FR', 'active', :'user_id', :'user_id', now(), now()),
  ('sup-11111111-0000-0000-0000-000000000003', :'org_id', 'TREMCO-NL', 'Tremco CPG Netherlands','NL', 'active', :'user_id', :'user_id', now(), now()),
  ('sup-11111111-0000-0000-0000-000000000004', :'org_id', 'EDGETECH',  'Edgetech Europe GmbH',  'DE', 'active', :'user_id', :'user_id', now(), now())
ON CONFLICT (id) DO NOTHING;

-- ─── SKUs — Raw Materials / Sub-assemblies / Finished Goods ──────────────────

INSERT INTO skus (id, organization_id, part_number, name, item_type, make_buy, unit_of_measure,
                  status, family_id, subfamily_id, default_supplier_id, lead_time_days,
                  created_by, updated_by, created_at, updated_at)
VALUES
  -- PVC Profiles (purchased)
  ('sku-11111111-0000-0000-0000-000000000001', :'org_id',
   'PRF-PVC-080', 'PVC Profile 80mm White', 'purchased_part', 'buy', 'lm',
   'active', 'fam-11111111-0000-0000-0000-000000000003', 'sub-11111111-0000-0000-0000-000000000001',
   'sup-11111111-0000-0000-0000-000000000001', 7,
   :'user_id', :'user_id', now(), now()),

  ('sku-11111111-0000-0000-0000-000000000002', :'org_id',
   'PRF-PVC-060', 'PVC Profile 60mm White', 'purchased_part', 'buy', 'lm',
   'active', 'fam-11111111-0000-0000-0000-000000000003', 'sub-11111111-0000-0000-0000-000000000001',
   'sup-11111111-0000-0000-0000-000000000001', 7,
   :'user_id', :'user_id', now(), now()),

  -- Glass Units (purchased)
  ('sku-11111111-0000-0000-0000-000000000003', :'org_id',
   'GLS-DBL-4-16-4', 'Double Glazed Unit 4-16-4 Clear', 'purchased_part', 'buy', 'm2',
   'active', 'fam-11111111-0000-0000-0000-000000000004', 'sub-11111111-0000-0000-0000-000000000005',
   'sup-11111111-0000-0000-0000-000000000002', 10,
   :'user_id', :'user_id', now(), now()),

  ('sku-11111111-0000-0000-0000-000000000004', :'org_id',
   'GLS-TRP-4-12-4-12-4', 'Triple Glazed Unit 4-12-4-12-4 Low-E', 'purchased_part', 'buy', 'm2',
   'active', 'fam-11111111-0000-0000-0000-000000000004', 'sub-11111111-0000-0000-0000-000000000006',
   'sup-11111111-0000-0000-0000-000000000002', 14,
   :'user_id', :'user_id', now(), now()),

  -- Seals and Hardware (purchased)
  ('sku-11111111-0000-0000-0000-000000000005', :'org_id',
   'SEL-EPDM-MAIN', 'EPDM Main Seal per meter', 'purchased_part', 'buy', 'lm',
   'active', null, null,
   'sup-11111111-0000-0000-0000-000000000003', 5,
   :'user_id', :'user_id', now(), now()),

  ('sku-11111111-0000-0000-0000-000000000006', :'org_id',
   'SEL-EPDM-GLAZ', 'EPDM Glazing Seal per meter', 'purchased_part', 'buy', 'lm',
   'active', null, null,
   'sup-11111111-0000-0000-0000-000000000003', 5,
   :'user_id', :'user_id', now(), now()),

  ('sku-11111111-0000-0000-0000-000000000007', :'org_id',
   'SPC-WARM-EDGE', 'Warm Edge Spacer per meter', 'purchased_part', 'buy', 'lm',
   'active', null, null,
   'sup-11111111-0000-0000-0000-000000000004', 7,
   :'user_id', :'user_id', now(), now()),

  -- Sub-assembly (make item with BOM)
  ('sku-11111111-0000-0000-0000-000000000010', :'org_id',
   'FRM-WND-080-DBL', 'Window Frame 80mm PVC Double Glaze', 'sub_assembly', 'make', 'pcs',
   'active', 'fam-11111111-0000-0000-0000-000000000003', 'sub-11111111-0000-0000-0000-000000000001',
   null, 2,
   :'user_id', :'user_id', now(), now()),

  -- Finished goods (make items with BOMs)
  ('sku-11111111-0000-0000-0000-000000000020', :'org_id',
   'WND-CASEMENT-080-DBL', 'Casement Window 80mm PVC 1200x1000 Double', 'finished_good', 'make', 'pcs',
   'active', 'fam-11111111-0000-0000-0000-000000000001', 'sub-11111111-0000-0000-0000-000000000003',
   null, 3,
   :'user_id', :'user_id', now(), now()),

  ('sku-11111111-0000-0000-0000-000000000021', :'org_id',
   'WND-CASEMENT-080-TRP', 'Casement Window 80mm PVC 1200x1000 Triple', 'finished_good', 'make', 'pcs',
   'active', 'fam-11111111-0000-0000-0000-000000000001', 'sub-11111111-0000-0000-0000-000000000004',
   null, 3,
   :'user_id', :'user_id', now(), now())
ON CONFLICT (id) DO NOTHING;

-- ─── Supplier Prices ──────────────────────────────────────────────────────────

INSERT INTO supplier_prices (id, organization_id, sku_id, supplier_id, unit_price, currency,
                              effective_from, effective_to, created_by, updated_by, created_at, updated_at)
VALUES
  ('spr-11111111-0000-0000-0000-000000000001', :'org_id',
   'sku-11111111-0000-0000-0000-000000000001', 'sup-11111111-0000-0000-0000-000000000001',
   3.20, 'EUR', '2024-01-01', null, :'user_id', :'user_id', now(), now()),

  ('spr-11111111-0000-0000-0000-000000000002', :'org_id',
   'sku-11111111-0000-0000-0000-000000000002', 'sup-11111111-0000-0000-0000-000000000001',
   2.60, 'EUR', '2024-01-01', null, :'user_id', :'user_id', now(), now()),

  ('spr-11111111-0000-0000-0000-000000000003', :'org_id',
   'sku-11111111-0000-0000-0000-000000000003', 'sup-11111111-0000-0000-0000-000000000002',
   28.50, 'EUR', '2024-01-01', null, :'user_id', :'user_id', now(), now()),

  ('spr-11111111-0000-0000-0000-000000000004', :'org_id',
   'sku-11111111-0000-0000-0000-000000000004', 'sup-11111111-0000-0000-0000-000000000002',
   42.00, 'EUR', '2024-01-01', null, :'user_id', :'user_id', now(), now()),

  ('spr-11111111-0000-0000-0000-000000000005', :'org_id',
   'sku-11111111-0000-0000-0000-000000000005', 'sup-11111111-0000-0000-0000-000000000003',
   0.45, 'EUR', '2024-01-01', null, :'user_id', :'user_id', now(), now()),

  ('spr-11111111-0000-0000-0000-000000000006', :'org_id',
   'sku-11111111-0000-0000-0000-000000000006', 'sup-11111111-0000-0000-0000-000000000003',
   0.38, 'EUR', '2024-01-01', null, :'user_id', :'user_id', now(), now()),

  ('spr-11111111-0000-0000-0000-000000000007', :'org_id',
   'sku-11111111-0000-0000-0000-000000000007', 'sup-11111111-0000-0000-0000-000000000004',
   1.20, 'EUR', '2024-01-01', null, :'user_id', :'user_id', now(), now())
ON CONFLICT (id) DO NOTHING;

-- ─── BOMs ─────────────────────────────────────────────────────────────────────

INSERT INTO boms (id, organization_id, sku_id, created_by, updated_by, created_at, updated_at)
VALUES
  ('bom-11111111-0000-0000-0000-000000000001', :'org_id',
   'sku-11111111-0000-0000-0000-000000000010', :'user_id', :'user_id', now(), now()),

  ('bom-11111111-0000-0000-0000-000000000002', :'org_id',
   'sku-11111111-0000-0000-0000-000000000020', :'user_id', :'user_id', now(), now()),

  ('bom-11111111-0000-0000-0000-000000000003', :'org_id',
   'sku-11111111-0000-0000-0000-000000000021', :'user_id', :'user_id', now(), now())
ON CONFLICT (id) DO NOTHING;

-- ─── BOM Versions ─────────────────────────────────────────────────────────────
-- is_locked = true because status = 'approved'. These are immutable reference recipes.

INSERT INTO bom_versions (id, organization_id, bom_id, version_number, status, is_locked,
                           effective_from, approved_by, approved_at,
                           created_by, updated_by, created_at, updated_at)
VALUES
  ('bmv-11111111-0000-0000-0000-000000000001', :'org_id',
   'bom-11111111-0000-0000-0000-000000000001', 1, 'approved', true,
   '2024-01-01', :'user_id', now(),
   :'user_id', :'user_id', now(), now()),

  ('bmv-11111111-0000-0000-0000-000000000002', :'org_id',
   'bom-11111111-0000-0000-0000-000000000002', 1, 'approved', true,
   '2024-01-01', :'user_id', now(),
   :'user_id', :'user_id', now(), now()),

  ('bmv-11111111-0000-0000-0000-000000000003', :'org_id',
   'bom-11111111-0000-0000-0000-000000000003', 1, 'approved', true,
   '2024-01-01', :'user_id', now(),
   :'user_id', :'user_id', now(), now())
ON CONFLICT (id) DO NOTHING;

-- ─── BOM Lines — Frame sub-assembly (FRM-WND-080-DBL) ────────────────────────
-- Recipe: 4.4m PVC 80mm + 0.8m PVC 60mm rebate + 3.2m main seal + 3.2m glaze seal

INSERT INTO bom_lines (id, organization_id, bom_version_id, line_type, sku_id,
                        quantity, unit_of_measure, position, parent_line_id,
                        created_by, updated_by, created_at, updated_at)
VALUES
  ('bln-11111111-0000-0000-0000-000000000101', :'org_id',
   'bmv-11111111-0000-0000-0000-000000000001', 'sku', 'sku-11111111-0000-0000-0000-000000000001',
   4.4, 'lm', 1, null,
   :'user_id', :'user_id', now(), now()),

  ('bln-11111111-0000-0000-0000-000000000102', :'org_id',
   'bmv-11111111-0000-0000-0000-000000000001', 'sku', 'sku-11111111-0000-0000-0000-000000000002',
   0.8, 'lm', 2, null,
   :'user_id', :'user_id', now(), now()),

  ('bln-11111111-0000-0000-0000-000000000103', :'org_id',
   'bmv-11111111-0000-0000-0000-000000000001', 'sku', 'sku-11111111-0000-0000-0000-000000000005',
   3.2, 'lm', 3, null,
   :'user_id', :'user_id', now(), now()),

  ('bln-11111111-0000-0000-0000-000000000104', :'org_id',
   'bmv-11111111-0000-0000-0000-000000000001', 'sku', 'sku-11111111-0000-0000-0000-000000000006',
   3.2, 'lm', 4, null,
   :'user_id', :'user_id', now(), now())
ON CONFLICT (id) DO NOTHING;

-- ─── BOM Lines — Double-glazed window FG (WND-CASEMENT-080-DBL) ───────────────
-- Recipe: 1x frame sub-assembly + 1.08m2 double glaze + 3.4m warm edge spacer

INSERT INTO bom_lines (id, organization_id, bom_version_id, line_type, sku_id,
                        quantity, unit_of_measure, position, parent_line_id,
                        created_by, updated_by, created_at, updated_at)
VALUES
  ('bln-11111111-0000-0000-0000-000000000201', :'org_id',
   'bmv-11111111-0000-0000-0000-000000000002', 'sku', 'sku-11111111-0000-0000-0000-000000000010',
   1, 'pcs', 1, null,
   :'user_id', :'user_id', now(), now()),

  ('bln-11111111-0000-0000-0000-000000000202', :'org_id',
   'bmv-11111111-0000-0000-0000-000000000002', 'sku', 'sku-11111111-0000-0000-0000-000000000003',
   1.08, 'm2', 2, null,
   :'user_id', :'user_id', now(), now()),

  ('bln-11111111-0000-0000-0000-000000000203', :'org_id',
   'bmv-11111111-0000-0000-0000-000000000002', 'sku', 'sku-11111111-0000-0000-0000-000000000007',
   3.4, 'lm', 3, null,
   :'user_id', :'user_id', now(), now())
ON CONFLICT (id) DO NOTHING;

-- ─── BOM Lines — Triple-glazed window FG (WND-CASEMENT-080-TRP) ───────────────
-- Recipe: 1x frame + 1.08m2 triple glaze + 6.8m spacer (two panes)

INSERT INTO bom_lines (id, organization_id, bom_version_id, line_type, sku_id,
                        quantity, unit_of_measure, position, parent_line_id,
                        created_by, updated_by, created_at, updated_at)
VALUES
  ('bln-11111111-0000-0000-0000-000000000301', :'org_id',
   'bmv-11111111-0000-0000-0000-000000000003', 'sku', 'sku-11111111-0000-0000-0000-000000000010',
   1, 'pcs', 1, null,
   :'user_id', :'user_id', now(), now()),

  ('bln-11111111-0000-0000-0000-000000000302', :'org_id',
   'bmv-11111111-0000-0000-0000-000000000003', 'sku', 'sku-11111111-0000-0000-0000-000000000004',
   1.08, 'm2', 2, null,
   :'user_id', :'user_id', now(), now()),

  ('bln-11111111-0000-0000-0000-000000000303', :'org_id',
   'bmv-11111111-0000-0000-0000-000000000003', 'sku', 'sku-11111111-0000-0000-0000-000000000007',
   6.8, 'lm', 3, null,
   :'user_id', :'user_id', now(), now())
ON CONFLICT (id) DO NOTHING;

-- ─── Sites ────────────────────────────────────────────────────────────────────

INSERT INTO sites (id, organization_id, code, name, country, is_active, created_by, updated_by, created_at, updated_at)
VALUES
  ('sit-11111111-0000-0000-0000-000000000001', :'org_id', 'BERLIN', 'Berlin Plant', 'DE', true, :'user_id', :'user_id', now(), now()),
  ('sit-11111111-0000-0000-0000-000000000002', :'org_id', 'MUNICH', 'Munich Plant', 'DE', true, :'user_id', :'user_id', now(), now())
ON CONFLICT (id) DO NOTHING;

-- ─── Warehouses ───────────────────────────────────────────────────────────────
-- warehouse_type must be: raw_materials | work_in_progress | finished_goods | quarantine | consignment

INSERT INTO warehouses (id, organization_id, site_id, code, name, warehouse_type, is_active, created_by, updated_by, created_at, updated_at)
VALUES
  ('whs-11111111-0000-0000-0000-000000000001', :'org_id',
   'sit-11111111-0000-0000-0000-000000000001', 'BER-WH1', 'Berlin Raw Materials',  'raw_materials',    true, :'user_id', :'user_id', now(), now()),
  ('whs-11111111-0000-0000-0000-000000000002', :'org_id',
   'sit-11111111-0000-0000-0000-000000000001', 'BER-WH2', 'Berlin Finished Goods', 'finished_goods',   true, :'user_id', :'user_id', now(), now()),
  ('whs-11111111-0000-0000-0000-000000000003', :'org_id',
   'sit-11111111-0000-0000-0000-000000000002', 'MUN-WH1', 'Munich Production',     'work_in_progress', true, :'user_id', :'user_id', now(), now())
ON CONFLICT (id) DO NOTHING;

-- ─── Cost Sets ────────────────────────────────────────────────────────────────
-- cost_set_type must be: standard | budget | quote | actual | simulation
-- status must be: draft | active | archived

INSERT INTO cost_sets (id, organization_id, code, name, cost_set_type, base_currency,
                        effective_from, effective_to, status, is_default,
                        created_by, updated_by, created_at, updated_at)
VALUES
  ('cst-11111111-0000-0000-0000-000000000001', :'org_id',
   'BERLIN-2024', 'Berlin 2024 Standard Cost', 'standard', 'EUR',
   '2024-01-01', '2024-12-31', 'active', true,
   :'user_id', :'user_id', now(), now()),

  ('cst-11111111-0000-0000-0000-000000000002', :'org_id',
   'MUNICH-2024', 'Munich 2024 Standard Cost', 'standard', 'EUR',
   '2024-01-01', '2024-12-31', 'active', false,
   :'user_id', :'user_id', now(), now()),

  ('cst-11111111-0000-0000-0000-000000000003', :'org_id',
   'PROJECT-X',  'Project X Premium Cost',    'quote',    'EUR',
   '2024-06-01', null,         'active', false,
   :'user_id', :'user_id', now(), now())
ON CONFLICT (id) DO NOTHING;

-- ─── Cost Items — Berlin 2024 ─────────────────────────────────────────────────
-- value_unit must be: currency_amount | percentage | rate_per_hour | rate_per_unit
-- applies_to must be: per_unit | material_subtotal | labor_subtotal | bom_total
-- item_type must be: material_price | labor_rate | overhead_pct | freight_pct |
--                    duty_rate | tooling_fixed | scrap_rate | custom

INSERT INTO cost_items (id, organization_id, cost_set_id, item_type, scope_type, scope_id,
                         value, value_unit, currency, applies_to,
                         effective_from, effective_to,
                         created_by, updated_by, created_at, updated_at)
VALUES
  -- Global overhead 12% on material subtotal
  ('cit-11111111-0000-0000-0000-000000000001', :'org_id',
   'cst-11111111-0000-0000-0000-000000000001',
   'overhead_pct', 'global', null,
   12.0, 'percentage', null, 'material_subtotal',
   '2024-01-01', null,
   :'user_id', :'user_id', now(), now()),

  -- Family-level overhead: Windows +8%
  ('cit-11111111-0000-0000-0000-000000000002', :'org_id',
   'cst-11111111-0000-0000-0000-000000000001',
   'overhead_pct', 'family', 'fam-11111111-0000-0000-0000-000000000001',
   8.0, 'percentage', null, 'material_subtotal',
   '2024-01-01', null,
   :'user_id', :'user_id', now(), now()),

  -- SKU-level material price: PVC Profile 80mm (Berlin volume rate)
  ('cit-11111111-0000-0000-0000-000000000003', :'org_id',
   'cst-11111111-0000-0000-0000-000000000001',
   'material_price', 'sku', 'sku-11111111-0000-0000-0000-000000000001',
   3.10, 'currency_amount', 'EUR', 'per_unit',
   '2024-01-01', null,
   :'user_id', :'user_id', now(), now()),

  -- SKU-level material price: Double-glazed unit (volume discount vs supplier price)
  ('cit-11111111-0000-0000-0000-000000000004', :'org_id',
   'cst-11111111-0000-0000-0000-000000000001',
   'material_price', 'sku', 'sku-11111111-0000-0000-0000-000000000003',
   26.80, 'currency_amount', 'EUR', 'per_unit',
   '2024-01-01', null,
   :'user_id', :'user_id', now(), now()),

  -- SKU-level material price: Triple-glazed unit
  ('cit-11111111-0000-0000-0000-000000000005', :'org_id',
   'cst-11111111-0000-0000-0000-000000000001',
   'material_price', 'sku', 'sku-11111111-0000-0000-0000-000000000004',
   39.50, 'currency_amount', 'EUR', 'per_unit',
   '2024-01-01', null,
   :'user_id', :'user_id', now(), now())
ON CONFLICT (id) DO NOTHING;

-- ─── Cost Items — Munich 2024 (slightly higher rates) ────────────────────────

INSERT INTO cost_items (id, organization_id, cost_set_id, item_type, scope_type, scope_id,
                         value, value_unit, currency, applies_to,
                         effective_from, effective_to,
                         created_by, updated_by, created_at, updated_at)
VALUES
  -- Global overhead 14% (Munich plant runs higher)
  ('cit-11111111-0000-0000-0000-000000000011', :'org_id',
   'cst-11111111-0000-0000-0000-000000000002',
   'overhead_pct', 'global', null,
   14.0, 'percentage', null, 'material_subtotal',
   '2024-01-01', null,
   :'user_id', :'user_id', now(), now()),

  -- PVC 80mm — Munich rate slightly higher
  ('cit-11111111-0000-0000-0000-000000000012', :'org_id',
   'cst-11111111-0000-0000-0000-000000000002',
   'material_price', 'sku', 'sku-11111111-0000-0000-0000-000000000001',
   3.25, 'currency_amount', 'EUR', 'per_unit',
   '2024-01-01', null,
   :'user_id', :'user_id', now(), now()),

  -- Double-glazed — Munich rate
  ('cit-11111111-0000-0000-0000-000000000013', :'org_id',
   'cst-11111111-0000-0000-0000-000000000002',
   'material_price', 'sku', 'sku-11111111-0000-0000-0000-000000000003',
   27.50, 'currency_amount', 'EUR', 'per_unit',
   '2024-01-01', null,
   :'user_id', :'user_id', now(), now())
ON CONFLICT (id) DO NOTHING;

-- ─── Cost Rules ───────────────────────────────────────────────────────────────
-- Rules modify cost after the precedence hierarchy resolves a base cost.
-- effective_from is NOT NULL — no default in schema.

INSERT INTO cost_rules (id, organization_id, name, description, priority, is_active,
                         effective_from, created_by, updated_by, created_at, updated_at)
VALUES
  ('rul-11111111-0000-0000-0000-000000000001', :'org_id',
   'Window Family Premium',
   'Add 5% mark-up for all Window family SKUs to reflect final assembly complexity',
   10, true, '2024-01-01', :'user_id', :'user_id', now(), now()),

  ('rul-11111111-0000-0000-0000-000000000002', :'org_id',
   'Triple Glaze Cap',
   'Cap triple glazing unit cost at 50 EUR/m2 per negotiated procurement agreement',
   20, true, '2024-01-01', :'user_id', :'user_id', now(), now()),

  ('rul-11111111-0000-0000-0000-000000000003', :'org_id',
   'Discontinued SKU Exclude',
   'Exclude discontinued SKUs from rollup — inactive example rule for demo purposes',
   99, false, '2024-01-01', :'user_id', :'user_id', now(), now())
ON CONFLICT (id) DO NOTHING;

-- ─── Rule Conditions ──────────────────────────────────────────────────────────
-- cost_rule_id references cost_rules.id (schema uses cost_rule_id, NOT rule_id)

INSERT INTO rule_conditions (id, organization_id, cost_rule_id, condition_field, condition_operator, condition_value, logical_group, created_by, created_at)
VALUES
  -- Rule 1: applies to Window family
  ('rcd-11111111-0000-0000-0000-000000000001', :'org_id',
   'rul-11111111-0000-0000-0000-000000000001',
   'sku.family_id', 'equals', 'fam-11111111-0000-0000-0000-000000000001', 0,
   :'user_id', now()),

  -- Rule 2 condition A: purchased parts only (AND group 0)
  ('rcd-11111111-0000-0000-0000-000000000002', :'org_id',
   'rul-11111111-0000-0000-0000-000000000002',
   'sku.item_type', 'equals', 'purchased_part', 0,
   :'user_id', now()),

  -- Rule 2 condition B: laminated glass subfamily (AND group 0 — both must match)
  ('rcd-11111111-0000-0000-0000-000000000003', :'org_id',
   'rul-11111111-0000-0000-0000-000000000002',
   'sku.subfamily_id', 'equals', 'sub-11111111-0000-0000-0000-000000000006', 0,
   :'user_id', now())
ON CONFLICT (id) DO NOTHING;

-- ─── Rule Actions ─────────────────────────────────────────────────────────────
-- cost_rule_id references cost_rules.id (schema uses cost_rule_id, NOT rule_id)

INSERT INTO rule_actions (id, organization_id, cost_rule_id, action_type, action_value, action_sequence, created_by, created_at)
VALUES
  -- Rule 1: add 5%
  ('rac-11111111-0000-0000-0000-000000000001', :'org_id',
   'rul-11111111-0000-0000-0000-000000000001',
   'add_percentage', 5.0, 1, :'user_id', now()),

  -- Rule 2: cap at 50 EUR/m2
  ('rac-11111111-0000-0000-0000-000000000002', :'org_id',
   'rul-11111111-0000-0000-0000-000000000002',
   'cap_at_value', 50.0, 1, :'user_id', now())
ON CONFLICT (id) DO NOTHING;

-- ─── Summary ──────────────────────────────────────────────────────────────────
-- Seeded:
--   4 families:           Windows, Doors, Profiles, Glass
--   6 subfamilies:        PVC, ALU, Double, Triple, Clear, Laminated
--   4 suppliers:          REHAU (DE), Saint-Gobain (FR), Tremco (NL), Edgetech (DE)
--  10 SKUs:               7 purchased parts, 1 sub-assembly, 2 finished goods
--   7 supplier prices:    all EUR, open-ended (no effective_to)
--   3 BOMs:               frame sub-assembly, double-glaze FG, triple-glaze FG
--   3 BOM versions:       all approved + is_locked=true
--  10 BOM lines:          across 3 BOM versions, all line_type='sku', no scrap_rate
--   2 sites:              Berlin Plant, Munich Plant (both DE)
--   3 warehouses:         Berlin raw_materials, Berlin finished_goods, Munich work_in_progress
--   3 cost sets:          Berlin 2024 (default), Munich 2024, Project X (quote)
--   8 cost items:         5 Berlin, 3 Munich — mix of overhead_pct and material_price
--   3 cost rules:         window premium +5%, triple-glaze cap €50, inactive example
--   3 rule conditions:    aligned to cost_rule_id FK
--   2 rule actions:       add_percentage + cap_at_value

-- Demo scenarios supported by this seed:
--   1. Calculate double-glazed window (WND-CASEMENT-080-DBL) under Berlin 2024 cost set
--   2. Calculate triple-glazed window (WND-CASEMENT-080-TRP) — rule 2 cap fires
--   3. Compare Berlin vs Munich cost sets for the same product
--   4. Run validation — no missing costs, no cycle, all rules valid → 0 blocking findings
--   5. Create inventory snapshot and value raw material stock at Berlin WH1
