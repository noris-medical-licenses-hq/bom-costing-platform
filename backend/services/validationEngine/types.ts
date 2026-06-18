// Validation Engine Types
// See TEST_STRATEGY.md §1B and BLUEPRINT §8 for all validation rules.

export type ValidationSeverity = 'error' | 'warning' | 'info'

export type ValidationRuleCode =
  // BOM structural validation
  | 'V-BOM-001'  // BOM must have at least one line
  | 'V-BOM-002'  // All bom_lines reference existing, active SKUs
  | 'V-BOM-003'  // Duplicate child SKU at same parent level (warning)
  | 'V-BOM-004'  // bom_line.quantity must be > 0
  | 'V-BOM-005'  // BOM must not contain cycles
  | 'V-BOM-006'  // Archived SKU referenced in BOM (warning)
  | 'V-BOM-007'  // Sub-assembly must have make_buy in (make, make_or_buy)
  // SKU validation
  | 'V-SKU-001'  // part_number must be unique within org
  | 'V-SKU-002'  // Subfamily must belong to specified Family
  | 'V-SKU-003'  // Discontinued SKU is parent in active BOM (warning)
  | 'V-SKU-004'  // No active cost found in active cost_set (warning)
  // Cost validation
  | 'V-COST-001' // cost_items.currency must match cost_sets.base_currency
  | 'V-COST-002' // Effective date overlap for same scope in same cost_set (warning)
  | 'V-COST-003' // Scrap rate must be between 0% and 100%
  | 'V-COST-004' // Global overhead_pct must exist in active cost_set (warning)
  | 'V-COST-005' // supplier_price exists but no cost_set_item (info)
  // Rule validation
  | 'V-RULE-001' // Rule condition references non-existent field
  | 'V-RULE-002' // Rule action value is outside valid range
  | 'V-RULE-003' // Active rule has no conditions (warning)
  | 'V-RULE-004' // Rule exception expired but status not updated (warning)
  // Inventory validation
  | 'V-INV-001'  // Inventory line SKU not in approved BOM version (warning)
  | 'V-INV-002'  // No cost found for inventory line SKU
  | 'V-INV-003'  // Snapshot valuation total is zero (warning)
  | 'V-INV-004'  // Snapshot approved with open ERROR findings (blocks approval)

export interface ValidationFindingInput {
  rule_code: ValidationRuleCode
  severity: ValidationSeverity
  entity_type: string
  entity_id: string | null
  message: string
  suggested_fix: string | null
}

export interface ValidationRunInput {
  scope_type: string
  scope_id: string | null
  run_type: 'on_demand' | 'pre_calculation' | 'pre_approval' | 'scheduled'
}

export interface ValidationResult {
  runId: string
  errorCount: number
  warningCount: number
  infoCount: number
  findings: ValidationFindingInput[]
  autoResolvedCount: number
}

// Each validator is a function with this signature
export type ValidatorFn<TContext = unknown> = (
  context: TContext
) => Promise<ValidationFindingInput[]>
