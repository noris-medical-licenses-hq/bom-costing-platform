import type { BomLine } from '../../repositories/bomRepository'
import type { CostItem, ManualCostAdjustment } from '../../repositories/costRepository'
import type { Tables } from '../../types/database.generated'

// ─── Engine Input / Output ────────────────────────────────────────────────────

export interface CostCalculationInput {
  bomId: string
  costSetId: string
  valuationDate?: string
  traceLevel?: 'summary' | 'detailed' | 'full'
}

export interface CostCalculationResult {
  traceId: string
  totalUnitCost: number
  currency: string
  breakdown: CostBreakdownLine[]
  warnings: CostWarning[]
  durationMs: number
}

export interface CostBreakdownLine {
  bomLineId: string
  skuId: string | null
  virtualComponentId: string | null
  partNumber: string | null
  name: string
  quantity: number
  unitCost: number
  totalCost: number       // unitCost × quantity × parent_qty chain
  rolledUpCost: number    // includes children
  depth: number
  costSource: CostSource
  appliedRules: AppliedRule[]
  appliedExceptions: AppliedRuleException[]
}

// ─── Cost Source (trace of which precedence level provided the cost) ──────────

export type CostSourceType =
  | 'manual_adjustment'        // Priority 0 — overrides everything
  | 'cost_set_item_sku'        // Priority 1
  | 'cost_set_item_subfamily'  // Priority 2
  | 'cost_set_item_family'     // Priority 3
  | 'cost_set_item_supplier'   // Priority 4 (supplier_country)
  | 'cost_set_item_global'     // Priority 5
  | 'supplier_price'           // Priority 6
  | 'none'                     // No cost found — warning emitted

export interface CostSource {
  type: CostSourceType
  precedenceLevel: 0 | 1 | 2 | 3 | 4 | 5 | 6 | null
  sourceId: string | null       // ID of the cost_item, manual_adjustment, or supplier_price
  value: number | null
  wasOverridden: boolean        // true if a higher-priority source also existed
  rejectedSources: RejectedCostSource[]
}

export interface RejectedCostSource {
  type: CostSourceType
  sourceId: string | null
  rejectionReason: string
}

// ─── Rule Application ─────────────────────────────────────────────────────────

export interface AppliedRule {
  ruleId: string
  ruleName: string
  priority: number
  wasApplied: boolean
  conditionsMet: boolean
  valueBeforeRule: number
  valueAfterRule: number
  adjustmentAmount: number
  rejectionReason: string | null
}

export interface AppliedRuleException {
  exceptionId: string
  ruleId: string
  wasApplied: boolean
  expiresAt: string | null
}

// ─── Warnings ────────────────────────────────────────────────────────────────

export type CostWarningCode =
  | 'NO_COST_FOUND'
  | 'ONLY_SUPPLIER_PRICE_AVAILABLE'
  | 'MANUAL_ADJUSTMENT_OVERRIDES_COST_SET'
  | 'BOM_LINE_ARCHIVED_SKU'
  | 'VIRTUAL_COMPONENT_ZERO_VALUE'
  | 'CALCULATION_ABORTED_ON_VALIDATION_ERROR'

export interface CostWarning {
  code: CostWarningCode
  skuId: string | null
  bomLineId: string | null
  message: string
}

// ─── Internal Engine State ────────────────────────────────────────────────────

// Flat BOM tree node used during roll-up traversal
export interface BomTreeNode {
  line: BomLine
  sku: Tables<'skus'> | null
  virtualComponent: Tables<'virtual_components'> | null
  children: BomTreeNode[]
  resolvedUnitCost: number | null
  rolledCost: number | null
  costSource: CostSource | null
  appliedRules: AppliedRule[]
  appliedExceptions: AppliedRuleException[]
}

// Cost map built during Stage 04: sku_id → resolved cost item + precedence
export type ResolvedCostMap = Map<string, {
  source: CostSource
  unitCost: number
}>

// Manual adjustment map built during Stage 03: sku_id → active adjustment
export type ManualAdjustmentMap = Map<string, ManualCostAdjustment>

// Active rules loaded for Stage 05
export interface ActiveRule {
  rule: Tables<'cost_rules'>
  conditions: Tables<'rule_conditions'>[]
  actions: Tables<'rule_actions'>[]
  exceptions: Tables<'rule_exceptions'>[]
}
