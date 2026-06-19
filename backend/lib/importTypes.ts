export type ImportType =
  | 'sku_master'
  | 'bom_lines'
  | 'costs'
  | 'inventory_snapshot'
  | 'supplier_prices'
  | 'suppliers'
  | 'sites'
  | 'warehouses'
  | 'cost_rules'
  | 'rule_exceptions'
  | 'virtual_components'
  | 'price_list'
  | 'purchase_history'

export interface TargetField {
  key: string
  label: string
  required: boolean
  type: 'string' | 'number' | 'boolean' | 'date'
  hint?: string
}

export const TARGET_FIELDS: Record<ImportType, TargetField[]> = {
  sku_master: [
    { key: 'sku',         label: 'SKU',         required: true,  type: 'string', hint: 'Unique part number / item code' },
    { key: 'description', label: 'Description', required: true,  type: 'string' },
    { key: 'family',      label: 'Family',      required: false, type: 'string' },
    { key: 'subfamily',   label: 'Subfamily',   required: false, type: 'string' },
    { key: 'uom',         label: 'UOM',         required: false, type: 'string', hint: 'Unit of measure (EA, KG, M…)' },
    { key: 'active',      label: 'Active',      required: false, type: 'boolean' },
  ],
  bom_lines: [
    { key: 'parent_sku',  label: 'Parent SKU',  required: true,  type: 'string' },
    { key: 'child_sku',   label: 'Child SKU',   required: true,  type: 'string' },
    { key: 'quantity',    label: 'Quantity',    required: true,  type: 'number' },
    { key: 'bom_version', label: 'BOM Version', required: false, type: 'string' },
    { key: 'notes',       label: 'Notes',       required: false, type: 'string' },
  ],
  costs: [
    { key: 'sku',            label: 'SKU',            required: true,  type: 'string' },
    { key: 'cost',           label: 'Cost',           required: true,  type: 'number' },
    { key: 'cost_set',       label: 'Cost Set',       required: true,  type: 'string' },
    { key: 'currency',       label: 'Currency',       required: false, type: 'string', hint: 'ISO 3-letter code, e.g. USD' },
    { key: 'effective_date', label: 'Effective Date', required: false, type: 'date' },
    { key: 'supplier',       label: 'Supplier',       required: false, type: 'string' },
    { key: 'notes',          label: 'Notes',          required: false, type: 'string' },
  ],
  inventory_snapshot: [
    { key: 'sku',           label: 'SKU',           required: true,  type: 'string' },
    { key: 'quantity',      label: 'Quantity',      required: true,  type: 'number' },
    { key: 'warehouse',     label: 'Warehouse',     required: false, type: 'string' },
    { key: 'site',          label: 'Site',          required: false, type: 'string' },
    { key: 'project',       label: 'Project',       required: false, type: 'string' },
    { key: 'snapshot_date', label: 'Snapshot Date', required: false, type: 'date' },
    { key: 'uom',           label: 'UOM',           required: false, type: 'string' },
    { key: 'notes',         label: 'Notes',         required: false, type: 'string' },
  ],
  price_list: [
    { key: 'part_number', label: 'Part Number',         required: true,  type: 'string', hint: 'Must match an existing SKU' },
    { key: 'description', label: 'Product Description', required: false, type: 'string' },
    { key: 'quantity',    label: 'Quantity / Pack Size', required: false, type: 'number' },
    { key: 'unit_price',  label: 'Unit Price',           required: true,  type: 'number' },
    { key: 'currency',    label: 'Currency',             required: false, type: 'string' },
  ],
  purchase_history: [
    { key: 'sku_part_number', label: 'Part Number',       required: true,  type: 'string', hint: 'Must match an existing SKU part number' },
    { key: 'purchase_date',   label: 'Purchase Date',     required: true,  type: 'date',   hint: 'YYYY-MM-DD' },
    { key: 'quantity',        label: 'Quantity',          required: true,  type: 'number', hint: 'Units purchased (> 0)' },
    { key: 'unit_cost',       label: 'Unit Cost',         required: true,  type: 'number', hint: 'Price per unit (0 = zero-cost sample)' },
    { key: 'currency',        label: 'Currency',          required: true,  type: 'string', hint: '3-letter ISO code, e.g. EUR' },
    { key: 'site_code',       label: 'Site Code',         required: false, type: 'string', hint: 'Must match sites.code — omit if selecting default site at import time' },
    { key: 'supplier_code',   label: 'Supplier Code',     required: false, type: 'string', hint: 'Must match suppliers.code in the system' },
    { key: 'source_system',   label: 'Source System',     required: false, type: 'string', hint: 'ERP system name (SAP, Oracle, Navision…)' },
    { key: 'source_reference',label: 'Source Reference',  required: false, type: 'string', hint: 'ERP document reference (PO number, line ID…)' },
  ],
  // Phase-2 types — structure defined, commit not yet implemented
  supplier_prices:    [],
  suppliers:          [],
  sites:              [],
  warehouses:         [],
  cost_rules:         [],
  rule_exceptions:    [],
  virtual_components: [],
}

export const IMPORT_TYPE_LABELS: Record<ImportType, string> = {
  sku_master:         'SKU Master',
  bom_lines:          'BOM Lines',
  costs:              'Costs',
  inventory_snapshot: 'Inventory Snapshot',
  price_list:         'Price List',
  purchase_history:   'Purchase History',
  supplier_prices:    'Supplier Prices',
  suppliers:          'Suppliers',
  sites:              'Sites',
  warehouses:         'Warehouses',
  cost_rules:         'Cost Rules',
  rule_exceptions:    'Rule Exceptions',
  virtual_components: 'Virtual Components',
}

export const MVP_IMPORT_TYPES: ImportType[] = [
  'sku_master',
  'bom_lines',
  'costs',
  'inventory_snapshot',
]

// BOM and Costs are all-or-nothing. Others allow partial commit.
export const ALL_OR_NOTHING_TYPES: ImportType[] = ['bom_lines', 'costs']
