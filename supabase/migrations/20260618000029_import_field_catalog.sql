-- M-029: Enterprise Import Field Catalog
-- New tables: import_field_definitions, import_field_synonyms,
--             import_field_usage_stats, organization_custom_fields
-- Replaces the import_field_dictionary approach with a structured catalog.
-- import_field_dictionary is preserved (no drop) for historical data.
-- RLS: global catalog readable by all authenticated users (approved in M-029 brief).

-- ── Tables ────────────────────────────────────────────────────────────────────

CREATE TABLE import_field_definitions (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid(),
  import_type           text        NOT NULL,
  field_key             text        NOT NULL,
  display_name          text        NOT NULL,
  description           text,
  data_type             text        NOT NULL DEFAULT 'text',
  field_category        text        NOT NULL DEFAULT 'core',
  required_by_default   boolean     NOT NULL DEFAULT false,
  is_system             boolean     NOT NULL DEFAULT true,
  is_deprecated         boolean     NOT NULL DEFAULT false,
  replacement_field_key text,
  active                boolean     NOT NULL DEFAULT true,
  sort_order            int         NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT import_field_definitions_pkey PRIMARY KEY (id),
  CONSTRAINT import_field_definitions_type_key_uidx UNIQUE (import_type, field_key),
  CONSTRAINT import_field_definitions_data_type_check
    CHECK (data_type IN ('text','integer','decimal','date','boolean','percent','currency'))
);

-- Synonyms: global (is_global=true, organization_id NULL) and org-specific.
-- Separate partial unique indexes handle NULL organization_id cleanly.
CREATE TABLE import_field_synonyms (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  import_type     text        NOT NULL,
  field_key       text        NOT NULL,
  synonym         text        NOT NULL,
  is_global       boolean     NOT NULL DEFAULT true,
  organization_id uuid        REFERENCES organizations(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT import_field_synonyms_pkey PRIMARY KEY (id),
  CONSTRAINT import_field_synonyms_scope_check
    CHECK (is_global = true OR organization_id IS NOT NULL)
);

CREATE UNIQUE INDEX import_field_synonyms_global_uidx
  ON import_field_synonyms (import_type, field_key, lower(synonym))
  WHERE is_global = true;

CREATE UNIQUE INDEX import_field_synonyms_org_uidx
  ON import_field_synonyms (import_type, field_key, lower(synonym), organization_id)
  WHERE is_global = false;

CREATE INDEX import_field_synonyms_lookup_idx
  ON import_field_synonyms (import_type, lower(synonym));

-- Per-org mapping frequency; used to boost confidence for previously-used mappings.
CREATE TABLE import_field_usage_stats (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  import_type     text        NOT NULL,
  source_column   text        NOT NULL,
  target_field    text        NOT NULL,
  mapping_count   int         NOT NULL DEFAULT 1,
  last_used_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT import_field_usage_stats_pkey PRIMARY KEY (id),
  CONSTRAINT import_field_usage_stats_uidx
    UNIQUE (organization_id, import_type, source_column, target_field)
);

CREATE INDEX import_field_usage_stats_org_type_idx
  ON import_field_usage_stats (organization_id, import_type);

-- Org-specific field additions that extend the global catalog.
CREATE TABLE organization_custom_fields (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id     uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  import_type         text        NOT NULL,
  field_key           text        NOT NULL,
  display_name        text        NOT NULL,
  description         text,
  data_type           text        NOT NULL DEFAULT 'text',
  field_category      text        NOT NULL DEFAULT 'custom',
  required_by_default boolean     NOT NULL DEFAULT false,
  active              boolean     NOT NULL DEFAULT true,
  sort_order          int         NOT NULL DEFAULT 999,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT organization_custom_fields_pkey PRIMARY KEY (id),
  CONSTRAINT organization_custom_fields_uidx
    UNIQUE (organization_id, import_type, field_key),
  CONSTRAINT organization_custom_fields_data_type_check
    CHECK (data_type IN ('text','integer','decimal','date','boolean','percent','currency'))
);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE import_field_definitions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_field_synonyms      ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_field_usage_stats   ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_custom_fields ENABLE ROW LEVEL SECURITY;

-- Global system catalog: read-only for all authenticated users. Approved in M-029 brief.
CREATE POLICY "import_field_definitions_read"
  ON import_field_definitions FOR SELECT TO authenticated USING (true);

-- Global synonyms: all authenticated users can read.
-- Org synonyms: org members can read and manage their own.
CREATE POLICY "import_field_synonyms_read"
  ON import_field_synonyms FOR SELECT TO authenticated
  USING (is_global = true OR organization_id = auth_org_id());

CREATE POLICY "import_field_synonyms_write"
  ON import_field_synonyms FOR INSERT TO authenticated
  WITH CHECK (is_global = false AND organization_id = auth_org_id());

CREATE POLICY "import_field_synonyms_delete"
  ON import_field_synonyms FOR DELETE TO authenticated
  USING (is_global = false AND organization_id = auth_org_id());

CREATE POLICY "import_field_usage_stats_org"
  ON import_field_usage_stats FOR ALL TO authenticated
  USING  (organization_id = auth_org_id())
  WITH CHECK (organization_id = auth_org_id());

CREATE POLICY "organization_custom_fields_org"
  ON organization_custom_fields FOR ALL TO authenticated
  USING  (organization_id = auth_org_id())
  WITH CHECK (organization_id = auth_org_id());

-- ── Seed: import_field_definitions ────────────────────────────────────────────

-- ─ SKU MASTER ─────────────────────────────────────────────────────────────────
INSERT INTO import_field_definitions
  (import_type, field_key, display_name, description, data_type, field_category, required_by_default, sort_order)
VALUES
  -- Core
  ('sku_master','sku',               'SKU',               'Unique part number / item code',           'text',    'core',           true,  10),
  ('sku_master','description',       'Description',       'Short item description',                   'text',    'core',           true,  20),
  ('sku_master','long_description',  'Long Description',  'Extended item description or spec text',   'text',    'core',           false, 30),
  ('sku_master','family',            'Family',            'Top-level product family',                 'text',    'core',           false, 40),
  ('sku_master','subfamily',         'Subfamily',         'Sub-family within the product family',     'text',    'core',           false, 50),
  ('sku_master','status',            'Status',            'Item lifecycle status',                    'text',    'core',           false, 60),
  ('sku_master','active',            'Active',            'Whether the item is active (Y/N)',         'boolean', 'core',           false, 70),
  ('sku_master','uom',               'UOM',               'Base unit of measure (EA, KG, M …)',       'text',    'core',           false, 80),
  ('sku_master','purchase_uom',      'Purchase UOM',      'Unit of measure used for purchasing',      'text',    'core',           false, 90),
  ('sku_master','stock_uom',         'Stock UOM',         'Unit of measure used for inventory',       'text',    'core',           false, 100),
  -- Classification
  ('sku_master','product_group',     'Product Group',     'Product classification group',             'text',    'classification', false, 110),
  ('sku_master','category',          'Category',          'Item category',                            'text',    'classification', false, 120),
  ('sku_master','brand',             'Brand',             'Brand name',                               'text',    'classification', false, 130),
  ('sku_master','manufacturer',      'Manufacturer',      'Manufacturer name',                        'text',    'classification', false, 140),
  ('sku_master','product_line',      'Product Line',      'Product line within the catalog',          'text',    'classification', false, 150),
  -- Identifiers
  ('sku_master','supplier_part_number',  'Supplier Part No.',  'Part number assigned by supplier',    'text',    'identifiers',    false, 160),
  ('sku_master','customer_part_number',  'Customer Part No.',  'Part number assigned by customer',    'text',    'identifiers',    false, 170),
  ('sku_master','internal_item_number',  'Internal Item No.',  'Internal ERP item number',            'text',    'identifiers',    false, 180),
  ('sku_master','barcode',               'Barcode',            'GTIN / EAN / UPC barcode',            'text',    'identifiers',    false, 190),
  ('sku_master','serial_tracking',       'Serial Tracking',    'Whether the item is serial-tracked',  'boolean', 'identifiers',    false, 200),
  -- Planning
  ('sku_master','lead_time_days',    'Lead Time (Days)',   'Standard procurement lead time in days',  'integer', 'planning',       false, 210),
  ('sku_master','minimum_order_qty', 'Min. Order Qty',    'Minimum purchase order quantity',          'decimal', 'planning',       false, 220),
  ('sku_master','reorder_point',     'Reorder Point',     'Inventory level that triggers reorder',    'decimal', 'planning',       false, 230),
  ('sku_master','safety_stock',      'Safety Stock',      'Minimum safety stock level to maintain',   'decimal', 'planning',       false, 240),
  -- Financial
  ('sku_master','standard_cost',     'Standard Cost',     'Standard cost per unit',                   'currency','financial',      false, 250),
  ('sku_master','last_cost',         'Last Cost',         'Most recent purchase cost',                'currency','financial',      false, 260),
  ('sku_master','preferred_currency','Preferred Currency','Preferred transaction currency (ISO code)','text',    'financial',      false, 270);

-- ─ BOM LINES ──────────────────────────────────────────────────────────────────
INSERT INTO import_field_definitions
  (import_type, field_key, display_name, description, data_type, field_category, required_by_default, sort_order)
VALUES
  -- Structure
  ('bom_lines','parent_sku',           'Parent SKU',           'SKU of the parent / assembly item',           'text',    'structure',      true,  10),
  ('bom_lines','child_sku',            'Child SKU',            'SKU of the component item',                   'text',    'structure',      true,  20),
  ('bom_lines','quantity',             'Quantity',             'Quantity of component per parent assembly',   'decimal', 'structure',      true,  30),
  -- Engineering
  ('bom_lines','bom_number',           'BOM Number',           'BOM document identifier',                     'text',    'engineering',    false, 40),
  ('bom_lines','bom_version',          'BOM Version',          'BOM version number or label',                 'text',    'engineering',    false, 50),
  ('bom_lines','engineering_revision', 'Engineering Rev.',     'ECO / engineering change revision level',     'text',    'engineering',    false, 60),
  ('bom_lines','effectivity_from',     'Effectivity From',     'Date from which this BOM line is valid',      'date',    'engineering',    false, 70),
  ('bom_lines','effectivity_to',       'Effectivity To',       'Date until which this BOM line is valid',     'date',    'engineering',    false, 80),
  -- Manufacturing
  ('bom_lines','operation_number',     'Operation Number',     'Manufacturing operation sequence number',     'text',    'manufacturing',  false, 90),
  ('bom_lines','work_center',          'Work Center',          'Work center / machine group for operation',   'text',    'manufacturing',  false, 100),
  ('bom_lines','routing_step',         'Routing Step',         'Step in the production routing',              'text',    'manufacturing',  false, 110),
  -- Planning
  ('bom_lines','scrap_percent',        'Scrap %',              'Expected scrap percentage for this component','percent', 'planning',       false, 120),
  ('bom_lines','yield_percent',        'Yield %',              'Expected process yield percentage',           'percent', 'planning',       false, 130),
  -- Classification
  ('bom_lines','component_type',       'Component Type',       'Component type (raw material, sub-assembly…)','text',   'classification', false, 140),
  ('bom_lines','make_buy',             'Make / Buy',           'Whether the component is made or purchased',  'text',   'classification', false, 150),
  ('bom_lines','phantom_item',         'Phantom Item',         'Whether this is a phantom / planning item',   'boolean','classification', false, 160),
  -- References
  ('bom_lines','drawing_number',       'Drawing Number',       'Engineering drawing reference number',        'text',    'references',     false, 170),
  ('bom_lines','document_reference',   'Document Reference',   'Related document / specification reference',  'text',    'references',     false, 180),
  ('bom_lines','notes',                'Notes',                'Free-text notes for this BOM line',           'text',    'references',     false, 190);

-- ─ INVENTORY SNAPSHOT ─────────────────────────────────────────────────────────
INSERT INTO import_field_definitions
  (import_type, field_key, display_name, description, data_type, field_category, required_by_default, sort_order)
VALUES
  -- Core
  ('inventory_snapshot','sku',              'SKU',              'Unique part number / item code',          'text',    'core',         true,  10),
  ('inventory_snapshot','quantity',         'Quantity',         'On-hand quantity',                        'decimal', 'core',         true,  20),
  ('inventory_snapshot','uom',              'UOM',              'Unit of measure for this quantity',       'text',    'core',         false, 25),
  ('inventory_snapshot','snapshot_date',    'Snapshot Date',    'Date of the physical count or extract',   'date',    'core',         false, 28),
  ('inventory_snapshot','project',          'Project',          'Project associated with this stock line', 'text',    'core',         false, 29),
  -- Warehouse
  ('inventory_snapshot','warehouse_code',   'Warehouse Code',   'Warehouse identifier code',               'text',    'warehouse',    false, 30),
  ('inventory_snapshot','warehouse_name',   'Warehouse Name',   'Warehouse display name',                  'text',    'warehouse',    false, 40),
  ('inventory_snapshot','site_code',        'Site Code',        'Site / plant identifier code',            'text',    'warehouse',    false, 50),
  ('inventory_snapshot','site_name',        'Site Name',        'Site / plant display name',               'text',    'warehouse',    false, 60),
  ('inventory_snapshot','location',         'Location',         'Storage location within the warehouse',   'text',    'warehouse',    false, 70),
  ('inventory_snapshot','bin_location',     'Bin Location',     'Bin / shelf / rack within location',      'text',    'warehouse',    false, 80),
  -- Stock
  ('inventory_snapshot','available_qty',    'Available Qty',    'Quantity available for use or sale',      'decimal', 'stock',        false, 90),
  ('inventory_snapshot','reserved_qty',     'Reserved Qty',     'Quantity reserved for orders',            'decimal', 'stock',        false, 100),
  ('inventory_snapshot','damaged_qty',      'Damaged Qty',      'Quantity in damaged status',              'decimal', 'stock',        false, 110),
  ('inventory_snapshot','quarantine_qty',   'Quarantine Qty',   'Quantity in quarantine / QC hold',        'decimal', 'stock',        false, 120),
  -- Traceability
  ('inventory_snapshot','lot_number',       'Lot Number',       'Lot or batch number for traceability',    'text',    'traceability', false, 130),
  ('inventory_snapshot','batch_number',     'Batch Number',     'Manufacturing batch number',              'text',    'traceability', false, 140),
  ('inventory_snapshot','serial_number',    'Serial Number',    'Item serial number',                      'text',    'traceability', false, 150),
  -- Dates
  ('inventory_snapshot','receipt_date',     'Receipt Date',     'Date item was received into stock',       'date',    'dates',        false, 160),
  ('inventory_snapshot','expiry_date',      'Expiry Date',      'Item expiration / use-by date',           'date',    'dates',        false, 170),
  ('inventory_snapshot','manufacture_date', 'Manufacture Date', 'Date item was manufactured',              'date',    'dates',        false, 180),
  -- Ownership
  ('inventory_snapshot','owner',            'Owner',            'Owner of this inventory (e.g. consignor)','text',    'ownership',    false, 190),
  ('inventory_snapshot','consignment_flag', 'Consignment',      'Whether this is consigned inventory',     'boolean', 'ownership',    false, 200),
  -- Notes
  ('inventory_snapshot','notes',            'Notes',            'Free-text notes for this stock line',     'text',    'core',         false, 205);

-- Deprecated aliases for backward compatibility with existing import templates
INSERT INTO import_field_definitions
  (import_type, field_key, display_name, data_type, field_category, is_deprecated, replacement_field_key, sort_order)
VALUES
  ('inventory_snapshot','warehouse','Warehouse (legacy)','text','warehouse',true,'warehouse_code',998),
  ('inventory_snapshot','site',     'Site (legacy)',     'text','warehouse',true,'site_code',      999);

-- ─ COSTS ──────────────────────────────────────────────────────────────────────
INSERT INTO import_field_definitions
  (import_type, field_key, display_name, description, data_type, field_category, required_by_default, sort_order)
VALUES
  -- Core
  ('costs','sku',              'SKU',              'Part number being costed',                'text',     'core',           true,  10),
  ('costs','cost',             'Cost',             'Unit cost value',                         'currency', 'core',           true,  20),
  -- Financial
  ('costs','currency',         'Currency',         'ISO 3-letter currency code (e.g. USD)',   'text',     'financial',      false, 30),
  ('costs','exchange_rate',    'Exchange Rate',    'FX rate to base currency at time of cost','decimal',  'financial',      false, 40),
  ('costs','cost_set',         'Cost Set',         'Name of the cost set / price list',       'text',     'financial',      true,  50),
  ('costs','cost_version',     'Cost Version',     'Version label within the cost set',       'text',     'financial',      false, 60),
  -- Dates
  ('costs','effective_date',   'Effective Date',   'Date from which cost is valid',           'date',     'dates',          false, 70),
  ('costs','expiration_date',  'Expiration Date',  'Date cost expires or is superseded',      'date',     'dates',          false, 80),
  -- Source
  ('costs','supplier',         'Supplier',         'Supplier name or code for this cost',     'text',     'source',         false, 90),
  ('costs','contract_number',  'Contract Number',  'Purchase contract reference',             'text',     'source',         false, 100),
  ('costs','quotation_number', 'Quotation Number', 'Supplier quotation / quote reference',    'text',     'source',         false, 110),
  -- Cost Breakdown
  ('costs','material_cost',   'Material Cost',    'Material component of unit cost',          'currency', 'cost_breakdown', false, 120),
  ('costs','labor_cost',      'Labor Cost',       'Labor component of unit cost',             'currency', 'cost_breakdown', false, 130),
  ('costs','overhead_cost',   'Overhead Cost',    'Overhead / burden component of unit cost', 'currency', 'cost_breakdown', false, 140),
  ('costs','freight_cost',    'Freight Cost',     'Freight / shipping cost component',        'currency', 'cost_breakdown', false, 150),
  ('costs','duty_cost',       'Duty Cost',        'Customs duty component of unit cost',      'currency', 'cost_breakdown', false, 160),
  ('costs','notes',           'Notes',            'Free-text notes for this cost record',     'text',     'source',         false, 170);

-- ─ SUPPLIER PRICES ────────────────────────────────────────────────────────────
INSERT INTO import_field_definitions
  (import_type, field_key, display_name, description, data_type, field_category, required_by_default, sort_order)
VALUES
  -- Supplier
  ('supplier_prices','supplier_code',     'Supplier Code',     'Unique supplier identifier',                  'text',     'supplier',    true,  10),
  ('supplier_prices','supplier_name',     'Supplier Name',     'Supplier display name',                       'text',     'supplier',    false, 20),
  -- Commercial
  ('supplier_prices','sku',               'SKU',               'Part number being priced',                    'text',     'commercial',  true,  30),
  ('supplier_prices','supplier_price',    'Supplier Price',    'Quoted or contracted price per unit',         'currency', 'commercial',  true,  40),
  ('supplier_prices','currency',          'Currency',          'ISO 3-letter currency code',                  'text',     'commercial',  false, 50),
  ('supplier_prices','lead_time_days',    'Lead Time (Days)',  'Supplier lead time in calendar days',         'integer',  'commercial',  false, 60),
  ('supplier_prices','minimum_order_qty', 'Min. Order Qty',   'Minimum order quantity at this price',        'decimal',  'commercial',  false, 70),
  -- Terms
  ('supplier_prices','payment_terms',     'Payment Terms',     'Payment terms (e.g. Net 30, 60 days)',        'text',     'terms',       false, 80),
  ('supplier_prices','incoterms',         'Incoterms',         'Delivery terms (EXW, FOB, CIF, DDP …)',       'text',     'terms',       false, 90),
  -- Performance
  ('supplier_prices','supplier_rating',   'Supplier Rating',   'Supplier performance rating (1–5)',           'decimal',  'performance', false, 100);

-- ─ MANUFACTURING ORDERS ───────────────────────────────────────────────────────
INSERT INTO import_field_definitions
  (import_type, field_key, display_name, description, data_type, field_category, required_by_default, sort_order)
VALUES
  -- Production
  ('manufacturing_orders','work_order_number',       'Work Order Number',       'Production work order identifier',           'text',    'production', true,  10),
  ('manufacturing_orders','production_order_number', 'Production Order Number', 'Production order / job reference',           'text',    'production', false, 20),
  ('manufacturing_orders','sku',                     'SKU',                     'SKU / item being produced',                  'text',    'production', true,  30),
  ('manufacturing_orders','quantity',                'Quantity',                'Quantity ordered for production',            'decimal', 'production', false, 40),
  -- Planning
  ('manufacturing_orders','demand_source', 'Demand Source', 'Source of demand (sales order, forecast, …)', 'text', 'planning',   false, 50),
  ('manufacturing_orders','project_code',  'Project Code',  'Associated project code',                    'text', 'planning',   false, 60),
  -- Execution
  ('manufacturing_orders','machine',   'Machine',   'Machine or work cell assigned',  'text', 'execution', false, 70),
  ('manufacturing_orders','operator',  'Operator',  'Assigned operator or team name', 'text', 'execution', false, 80);

-- ─ PROJECTS ───────────────────────────────────────────────────────────────────
INSERT INTO import_field_definitions
  (import_type, field_key, display_name, description, data_type, field_category, required_by_default, sort_order)
VALUES
  ('projects','project_code',  'Project Code',  'Unique project identifier',        'text', 'core', true,  10),
  ('projects','project_name',  'Project Name',  'Project display name',             'text', 'core', false, 20),
  ('projects','customer_code', 'Customer Code', 'Customer / client identifier code','text', 'core', false, 30),
  ('projects','customer_name', 'Customer Name', 'Customer / client display name',   'text', 'core', false, 40);

-- ── Seed: import_field_synonyms ───────────────────────────────────────────────
-- Global synonyms only (is_global = true). Org-specific synonyms are added via UI/API.

-- ─ sku (appears in: sku_master, costs, inventory_snapshot, supplier_prices, manufacturing_orders) ──
INSERT INTO import_field_synonyms (import_type, field_key, synonym, is_global)
SELECT t, 'sku', s, true
FROM (VALUES
  ('sku_master'),('costs'),('inventory_snapshot'),('supplier_prices'),('manufacturing_orders')
) AS types(t)
CROSS JOIN (VALUES
  ('SKU'),('Item Code'),('Item'),('Item Number'),('Part Number'),
  ('Part No'),('Material Number'),('Catalog Number'),('Product Code'),
  ('מקט'),('מק"ט'),('Part#'),('PN'),('Article Number'),('Article'),
  ('Materiale'),('Partnummer'),('Material'),('Art. No'),('Item Ref')
) AS syns(s)
ON CONFLICT DO NOTHING;

-- ─ sku: bom_lines parent/child specifically ──────────────────────────────────
INSERT INTO import_field_synonyms (import_type, field_key, synonym, is_global) VALUES
  ('bom_lines','parent_sku','Parent SKU',true),
  ('bom_lines','parent_sku','Parent Item',true),
  ('bom_lines','parent_sku','Parent Part',true),
  ('bom_lines','parent_sku','Parent',true),
  ('bom_lines','parent_sku','Assembly',true),
  ('bom_lines','parent_sku','Assembly SKU',true),
  ('bom_lines','parent_sku','BOM Parent',true),
  ('bom_lines','parent_sku','Parent Item Number',true),
  ('bom_lines','parent_sku','Parent Part Number',true),
  ('bom_lines','parent_sku','Assembly Item',true),
  ('bom_lines','child_sku','Child SKU',true),
  ('bom_lines','child_sku','Child Item',true),
  ('bom_lines','child_sku','Component',true),
  ('bom_lines','child_sku','Component SKU',true),
  ('bom_lines','child_sku','Child Part',true),
  ('bom_lines','child_sku','Material',true),
  ('bom_lines','child_sku','Child',true),
  ('bom_lines','child_sku','Child Item Number',true),
  ('bom_lines','child_sku','Component Part Number',true),
  ('bom_lines','child_sku','Sub-Component',true)
ON CONFLICT DO NOTHING;

-- ─ quantity (appears in: inventory_snapshot, bom_lines, manufacturing_orders) ─
INSERT INTO import_field_synonyms (import_type, field_key, synonym, is_global)
SELECT t, 'quantity', s, true
FROM (VALUES ('inventory_snapshot'),('bom_lines'),('manufacturing_orders')) AS types(t)
CROSS JOIN (VALUES
  ('Quantity'),('Qty'),('Amount'),('Count'),('Units'),
  ('On Hand'),('Stock'),('Menge'),('Quantité'),('כמות'),
  ('Qty.'),('Total Qty'),('Stock Qty')
) AS syns(s)
ON CONFLICT DO NOTHING;

-- ─ description ──────────────────────────────────────────────────────────────
INSERT INTO import_field_synonyms (import_type, field_key, synonym, is_global) VALUES
  ('sku_master','description','Description',true),
  ('sku_master','description','Item Description',true),
  ('sku_master','description','Part Description',true),
  ('sku_master','description','Product Description',true),
  ('sku_master','description','Name',true),
  ('sku_master','description','Item Name',true),
  ('sku_master','description','Short Description',true),
  ('sku_master','description','Title',true),
  ('sku_master','description','תיאור',true),
  ('sku_master','description','Desc',true),
  ('sku_master','description','Item Desc',true),
  -- long_description
  ('sku_master','long_description','Long Description',true),
  ('sku_master','long_description','Extended Description',true),
  ('sku_master','long_description','Full Description',true),
  ('sku_master','long_description','Specification',true),
  ('sku_master','long_description','Desc 2',true)
ON CONFLICT DO NOTHING;

-- ─ UOM (appears in: sku_master, inventory_snapshot, supplier_prices) ──────────
INSERT INTO import_field_synonyms (import_type, field_key, synonym, is_global)
SELECT t, 'uom', s, true
FROM (VALUES ('sku_master'),('inventory_snapshot')) AS types(t)
CROSS JOIN (VALUES
  ('UOM'),('Unit'),('Unit of Measure'),('Base Unit'),
  ('יחידה'),('יח מידה'),('יחידת מידה'),('UM'),('Einheit'),
  ('UOM Code'),('Unit Code'),('Measure Unit')
) AS syns(s)
ON CONFLICT DO NOTHING;

INSERT INTO import_field_synonyms (import_type, field_key, synonym, is_global)
SELECT t, 'purchase_uom', s, true
FROM (VALUES ('sku_master')) AS types(t)
CROSS JOIN (VALUES
  ('Purchase UOM'),('Purchase Unit'),('Purchasing UOM'),('Order Unit'),('PO Unit')
) AS syns(s)
ON CONFLICT DO NOTHING;

INSERT INTO import_field_synonyms (import_type, field_key, synonym, is_global)
SELECT t, 'stock_uom', s, true
FROM (VALUES ('sku_master')) AS types(t)
CROSS JOIN (VALUES
  ('Stock UOM'),('Inventory UOM'),('Storage Unit'),('Stock Unit')
) AS syns(s)
ON CONFLICT DO NOTHING;

-- ─ Warehouse fields ──────────────────────────────────────────────────────────
INSERT INTO import_field_synonyms (import_type, field_key, synonym, is_global) VALUES
  -- warehouse_code
  ('inventory_snapshot','warehouse_code','Warehouse',true),
  ('inventory_snapshot','warehouse_code','Warehouse Code',true),
  ('inventory_snapshot','warehouse_code','WH',true),
  ('inventory_snapshot','warehouse_code','WH Code',true),
  ('inventory_snapshot','warehouse_code','Storage Location',true),
  ('inventory_snapshot','warehouse_code','מחסן',true),
  ('inventory_snapshot','warehouse_code','Lager',true),
  ('inventory_snapshot','warehouse_code','Warehouse ID',true),
  ('inventory_snapshot','warehouse_code','Whs',true),
  ('inventory_snapshot','warehouse_code','Whs Code',true),
  -- warehouse_name
  ('inventory_snapshot','warehouse_name','Warehouse Name',true),
  ('inventory_snapshot','warehouse_name','WH Name',true),
  ('inventory_snapshot','warehouse_name','Warehouse Description',true),
  -- legacy alias (for backward compat with old templates)
  ('inventory_snapshot','warehouse','Warehouse',true),
  ('inventory_snapshot','warehouse','WH',true),
  ('inventory_snapshot','warehouse','Storage Location',true),
  ('inventory_snapshot','warehouse','מחסן',true)
ON CONFLICT DO NOTHING;

-- ─ Site fields ──────────────────────────────────────────────────────────────
INSERT INTO import_field_synonyms (import_type, field_key, synonym, is_global) VALUES
  ('inventory_snapshot','site_code','Site',true),
  ('inventory_snapshot','site_code','Site Code',true),
  ('inventory_snapshot','site_code','Plant',true),
  ('inventory_snapshot','site_code','Plant Code',true),
  ('inventory_snapshot','site_code','Factory',true),
  ('inventory_snapshot','site_code','מפעל',true),
  ('inventory_snapshot','site_code','Werk',true),
  ('inventory_snapshot','site_code','Location Code',true),
  ('inventory_snapshot','site_name','Site Name',true),
  ('inventory_snapshot','site_name','Plant Name',true),
  ('inventory_snapshot','site_name','Factory Name',true),
  -- legacy alias
  ('inventory_snapshot','site','Site',true),
  ('inventory_snapshot','site','Plant',true),
  ('inventory_snapshot','site','מפעל',true)
ON CONFLICT DO NOTHING;

-- ─ Location / Bin ────────────────────────────────────────────────────────────
INSERT INTO import_field_synonyms (import_type, field_key, synonym, is_global) VALUES
  ('inventory_snapshot','bin_location','Bin',true),
  ('inventory_snapshot','bin_location','Bin Location',true),
  ('inventory_snapshot','bin_location','Storage Bin',true),
  ('inventory_snapshot','bin_location','מיקום',true),
  ('inventory_snapshot','bin_location','Lagerort',true),
  ('inventory_snapshot','bin_location','Rack',true),
  ('inventory_snapshot','bin_location','Shelf',true),
  ('inventory_snapshot','location','Location',true),
  ('inventory_snapshot','location','Storage Location',true),
  ('inventory_snapshot','location','Stock Location',true)
ON CONFLICT DO NOTHING;

-- ─ Lot / Batch ──────────────────────────────────────────────────────────────
INSERT INTO import_field_synonyms (import_type, field_key, synonym, is_global) VALUES
  ('inventory_snapshot','lot_number','Lot',true),
  ('inventory_snapshot','lot_number','Batch',true),
  ('inventory_snapshot','lot_number','Lot Number',true),
  ('inventory_snapshot','lot_number','Lot No',true),
  ('inventory_snapshot','lot_number','LOT',true),
  ('inventory_snapshot','lot_number','אצווה',true),
  ('inventory_snapshot','batch_number','Batch Number',true),
  ('inventory_snapshot','batch_number','Batch No',true),
  ('inventory_snapshot','batch_number','Batch ID',true),
  ('inventory_snapshot','batch_number','אצווה',true)
ON CONFLICT DO NOTHING;

-- ─ Dates ─────────────────────────────────────────────────────────────────────
INSERT INTO import_field_synonyms (import_type, field_key, synonym, is_global) VALUES
  ('inventory_snapshot','expiry_date','Expiry Date',true),
  ('inventory_snapshot','expiry_date','Expiration Date',true),
  ('inventory_snapshot','expiry_date','Exp. Date',true),
  ('inventory_snapshot','expiry_date','Use By',true),
  ('inventory_snapshot','expiry_date','Best Before',true),
  ('inventory_snapshot','expiry_date','תאריך תפוגה',true),
  ('inventory_snapshot','receipt_date','Receipt Date',true),
  ('inventory_snapshot','receipt_date','Receive Date',true),
  ('inventory_snapshot','receipt_date','GR Date',true),
  ('inventory_snapshot','receipt_date','Goods Receipt Date',true),
  ('inventory_snapshot','manufacture_date','Manufacture Date',true),
  ('inventory_snapshot','manufacture_date','Mfg Date',true),
  ('inventory_snapshot','manufacture_date','Production Date',true),
  ('inventory_snapshot','snapshot_date','Snapshot Date',true),
  ('inventory_snapshot','snapshot_date','Count Date',true),
  ('inventory_snapshot','snapshot_date','Report Date',true),
  ('inventory_snapshot','snapshot_date','תאריך ספירה',true)
ON CONFLICT DO NOTHING;

-- ─ Cost fields ───────────────────────────────────────────────────────────────
INSERT INTO import_field_synonyms (import_type, field_key, synonym, is_global) VALUES
  ('costs','cost','Cost',true),
  ('costs','cost','Price',true),
  ('costs','cost','Unit Cost',true),
  ('costs','cost','Unit Price',true),
  ('costs','cost','Amount',true),
  ('costs','cost','Value',true),
  ('costs','cost','Standard Cost',true),
  ('costs','cost','מחיר',true),
  ('costs','cost','עלות',true),
  ('costs','cost','Net Price',true),
  ('costs','cost','Rate',true),
  -- currency
  ('costs','currency','Currency',true),
  ('costs','currency','CCY',true),
  ('costs','currency','Ccy',true),
  ('costs','currency','Currency Code',true),
  ('costs','currency','ISO Currency',true),
  ('costs','currency','מטבע',true),
  ('costs','currency','Devisen',true),
  -- effective_date
  ('costs','effective_date','Effective Date',true),
  ('costs','effective_date','Valid From',true),
  ('costs','effective_date','Date From',true),
  ('costs','effective_date','Start Date',true),
  ('costs','effective_date','From Date',true),
  ('costs','effective_date','תאריך תחולה',true),
  ('costs','effective_date','Price Date',true),
  -- cost_set
  ('costs','cost_set','Cost Set',true),
  ('costs','cost_set','Price List',true),
  ('costs','cost_set','Costing Scenario',true),
  ('costs','cost_set','Cost Version',true),
  ('costs','cost_set','Price Set',true),
  ('costs','cost_set','Cost Type',true),
  -- supplier
  ('costs','supplier','Supplier',true),
  ('costs','supplier','Vendor',true),
  ('costs','supplier','Supplier Name',true),
  ('costs','supplier','Vendor Name',true),
  ('costs','supplier','ספק',true)
ON CONFLICT DO NOTHING;

-- ─ Supplier price fields ─────────────────────────────────────────────────────
INSERT INTO import_field_synonyms (import_type, field_key, synonym, is_global) VALUES
  ('supplier_prices','currency','Currency',true),
  ('supplier_prices','currency','CCY',true),
  ('supplier_prices','currency','Currency Code',true),
  ('supplier_prices','currency','מטבע',true),
  ('supplier_prices','supplier_code','Supplier Code',true),
  ('supplier_prices','supplier_code','Vendor Code',true),
  ('supplier_prices','supplier_code','Supplier ID',true),
  ('supplier_prices','supplier_code','Vendor ID',true),
  ('supplier_prices','supplier_code','Supplier#',true),
  ('supplier_prices','supplier_code','Vendor#',true),
  ('supplier_prices','supplier_code','ספק',true),
  ('supplier_prices','supplier_code','Supplier Number',true),
  ('supplier_prices','supplier_name','Supplier Name',true),
  ('supplier_prices','supplier_name','Vendor Name',true),
  ('supplier_prices','supplier_name','Supplier',true),
  ('supplier_prices','supplier_price','Supplier Price',true),
  ('supplier_prices','supplier_price','Price',true),
  ('supplier_prices','supplier_price','Unit Price',true),
  ('supplier_prices','supplier_price','Quoted Price',true),
  ('supplier_prices','supplier_price','Contract Price',true),
  ('supplier_prices','lead_time_days','Lead Time',true),
  ('supplier_prices','lead_time_days','Lead Time Days',true),
  ('supplier_prices','lead_time_days','LT',true),
  ('supplier_prices','lead_time_days','Delivery Days',true),
  ('supplier_prices','lead_time_days','Delivery Time',true),
  ('supplier_prices','lead_time_days','זמן אספקה',true),
  ('supplier_prices','minimum_order_qty','MOQ',true),
  ('supplier_prices','minimum_order_qty','Min Order Qty',true),
  ('supplier_prices','minimum_order_qty','Minimum Qty',true),
  ('supplier_prices','incoterms','Incoterms',true),
  ('supplier_prices','incoterms','Delivery Terms',true),
  ('supplier_prices','incoterms','Trade Terms',true),
  ('supplier_prices','payment_terms','Payment Terms',true),
  ('supplier_prices','payment_terms','Terms',true),
  ('supplier_prices','payment_terms','Net Terms',true)
ON CONFLICT DO NOTHING;

-- ─ SKU Master field synonyms ─────────────────────────────────────────────────
INSERT INTO import_field_synonyms (import_type, field_key, synonym, is_global) VALUES
  ('sku_master','family','Family',true),
  ('sku_master','family','Product Family',true),
  ('sku_master','family','Group',true),
  ('sku_master','family','Product Group',true),
  ('sku_master','family','קבוצה',true),
  ('sku_master','family','משפחה',true),
  ('sku_master','family','Gruppe',true),
  ('sku_master','family','Family Code',true),
  ('sku_master','subfamily','Subfamily',true),
  ('sku_master','subfamily','Sub-Family',true),
  ('sku_master','subfamily','Sub Group',true),
  ('sku_master','subfamily','תת קבוצה',true),
  ('sku_master','status','Status',true),
  ('sku_master','status','Item Status',true),
  ('sku_master','status','State',true),
  ('sku_master','active','Active',true),
  ('sku_master','active','Is Active',true),
  ('sku_master','active','Enabled',true),
  ('sku_master','lead_time_days','Lead Time',true),
  ('sku_master','lead_time_days','Lead Time Days',true),
  ('sku_master','lead_time_days','LT',true),
  ('sku_master','lead_time_days','זמן אספקה',true),
  ('sku_master','minimum_order_qty','MOQ',true),
  ('sku_master','minimum_order_qty','Min Order',true),
  ('sku_master','minimum_order_qty','Min Qty',true),
  ('sku_master','standard_cost','Standard Cost',true),
  ('sku_master','standard_cost','Std Cost',true),
  ('sku_master','standard_cost','STD',true),
  ('sku_master','standard_cost','עלות תקן',true),
  ('sku_master','last_cost','Last Cost',true),
  ('sku_master','last_cost','Last Purchase Price',true),
  ('sku_master','last_cost','Recent Cost',true),
  ('sku_master','manufacturer','Manufacturer',true),
  ('sku_master','manufacturer','Mfr',true),
  ('sku_master','manufacturer','Make',true),
  ('sku_master','barcode','Barcode',true),
  ('sku_master','barcode','EAN',true),
  ('sku_master','barcode','GTIN',true),
  ('sku_master','barcode','UPC',true),
  ('sku_master','supplier_part_number','Supplier Part Number',true),
  ('sku_master','supplier_part_number','Supplier PN',true),
  ('sku_master','supplier_part_number','Mfr Part Number',true),
  ('sku_master','supplier_part_number','MPN',true)
ON CONFLICT DO NOTHING;

-- ─ BOM field synonyms ────────────────────────────────────────────────────────
INSERT INTO import_field_synonyms (import_type, field_key, synonym, is_global) VALUES
  ('bom_lines','bom_version','BOM Version',true),
  ('bom_lines','bom_version','Version',true),
  ('bom_lines','bom_version','Rev',true),
  ('bom_lines','bom_version','Revision',true),
  ('bom_lines','bom_number','BOM Number',true),
  ('bom_lines','bom_number','BOM No',true),
  ('bom_lines','bom_number','BOM ID',true),
  ('bom_lines','engineering_revision','Engineering Rev',true),
  ('bom_lines','engineering_revision','ECO',true),
  ('bom_lines','engineering_revision','Change Level',true),
  ('bom_lines','effectivity_from','Effectivity From',true),
  ('bom_lines','effectivity_from','Valid From',true),
  ('bom_lines','effectivity_from','Eff. From',true),
  ('bom_lines','effectivity_to','Effectivity To',true),
  ('bom_lines','effectivity_to','Valid To',true),
  ('bom_lines','effectivity_to','Eff. To',true),
  ('bom_lines','operation_number','Op No',true),
  ('bom_lines','operation_number','Operation',true),
  ('bom_lines','operation_number','Op. Number',true),
  ('bom_lines','work_center','Work Center',true),
  ('bom_lines','work_center','WC',true),
  ('bom_lines','work_center','Machine Group',true),
  ('bom_lines','scrap_percent','Scrap %',true),
  ('bom_lines','scrap_percent','Scrap',true),
  ('bom_lines','scrap_percent','Scrap Rate',true),
  ('bom_lines','yield_percent','Yield %',true),
  ('bom_lines','yield_percent','Yield',true),
  ('bom_lines','yield_percent','Yield Rate',true),
  ('bom_lines','drawing_number','Drawing Number',true),
  ('bom_lines','drawing_number','Drawing No',true),
  ('bom_lines','drawing_number','DRW',true)
ON CONFLICT DO NOTHING;

-- ─ Manufacturing order synonyms ──────────────────────────────────────────────
INSERT INTO import_field_synonyms (import_type, field_key, synonym, is_global) VALUES
  ('manufacturing_orders','work_order_number','WO',true),
  ('manufacturing_orders','work_order_number','Work Order',true),
  ('manufacturing_orders','work_order_number','WO Number',true),
  ('manufacturing_orders','work_order_number','WO#',true),
  ('manufacturing_orders','work_order_number','Work Order Number',true),
  ('manufacturing_orders','work_order_number','פק"ע',true),
  ('manufacturing_orders','work_order_number','פקע',true),
  ('manufacturing_orders','work_order_number','פקודת עבודה',true),
  ('manufacturing_orders','work_order_number','Job Number',true),
  ('manufacturing_orders','production_order_number','Production Order',true),
  ('manufacturing_orders','production_order_number','PO Number',true),
  ('manufacturing_orders','production_order_number','Prod Order',true),
  ('manufacturing_orders','machine','Machine',true),
  ('manufacturing_orders','machine','Work Center',true),
  ('manufacturing_orders','machine','Equipment',true),
  ('manufacturing_orders','operator','Operator',true),
  ('manufacturing_orders','operator','Worker',true),
  ('manufacturing_orders','operator','Assigned To',true)
ON CONFLICT DO NOTHING;

-- ── Helper: upsert + increment usage stats ────────────────────────────────────
-- SECURITY DEFINER so RLS on import_field_usage_stats does not block the insert.
CREATE OR REPLACE FUNCTION upsert_mapping_usage(
  p_org  uuid,
  p_type text,
  p_src  text,
  p_tgt  text
) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  INSERT INTO import_field_usage_stats
    (organization_id, import_type, source_column, target_field, mapping_count, last_used_at)
  VALUES
    (p_org, p_type, p_src, p_tgt, 1, now())
  ON CONFLICT (organization_id, import_type, source_column, target_field)
  DO UPDATE SET
    mapping_count = import_field_usage_stats.mapping_count + 1,
    last_used_at  = now();
$$;
