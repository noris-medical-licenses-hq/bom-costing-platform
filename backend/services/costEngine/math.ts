// Pure math and logic functions extracted from costEngine/index.ts for testability
import type { BomTreeNode } from './types'
import type { Sku } from '../../repositories/skuRepository'
import type { RuleCondition, RuleException } from '../../repositories/ruleRepository'

// Minimal interface for rule action — only the fields used by the math function
export interface RuleActionInput {
  action_type: 'add_percentage' | 'add_fixed' | 'multiply' | 'replace_cost' | 'exclude_from_rollup' | 'cap_at_value' | 'floor_at_value' | string
  action_value: number | null
}

// Applies a single rule action to the current cost value
export function applyAction(action: RuleActionInput, currentValue: number): number {
  const v = action.action_value
  switch (action.action_type) {
    case 'add_percentage':      return currentValue * (1 + (v ?? 0) / 100)
    case 'add_fixed':           return currentValue + (v ?? 0)
    case 'multiply':            return currentValue * (v ?? 1)
    case 'replace_cost':        return v ?? currentValue
    case 'cap_at_value':        return v !== null ? Math.min(currentValue, v) : currentValue
    case 'floor_at_value':      return v !== null ? Math.max(currentValue, v) : currentValue
    case 'exclude_from_rollup': return 0
    default:                    return currentValue
  }
}

// Returns the value of a dot-notated SKU field (e.g. "sku.family_id")
export function getSkuField(field: string, sku: Sku): unknown {
  const [table, column] = field.split('.')
  if (table === 'sku') return (sku as Record<string, unknown>)[column]
  return undefined
}

// Evaluates a single condition against a SKU
export function evaluateSingleCondition(cond: RuleCondition, sku: Sku): boolean {
  const value = getSkuField(cond.condition_field, sku)
  const target = cond.condition_value
  switch (cond.condition_operator) {
    case 'equals':       return String(value ?? '') === target
    case 'not_equals':   return String(value ?? '') !== target
    case 'in':           return target.split(',').map((s: string) => s.trim()).includes(String(value ?? ''))
    case 'not_in':       return !target.split(',').map((s: string) => s.trim()).includes(String(value ?? ''))
    case 'greater_than': return Number(value) > Number(target)
    case 'less_than':    return Number(value) < Number(target)
    case 'is_null':      return value === null || value === undefined
    case 'is_not_null':  return value !== null && value !== undefined
    default:             return false
  }
}

// Evaluates all conditions (groups are OR'd, conditions within a group are AND'd)
export function evaluateConditions(conditions: RuleCondition[], sku: Sku): boolean {
  if (conditions.length === 0) return true
  const groups = conditions.reduce<Record<number, RuleCondition[]>>((acc, c) => {
    ;(acc[c.logical_group] ??= []).push(c)
    return acc
  }, {})
  return Object.values(groups).some(group => group.every(cond => evaluateSingleCondition(cond, sku)))
}

// Checks whether a rule exception applies to a specific SKU
export function exceptionAppliesToSku(ex: RuleException, skuId: string, sku: Sku): boolean {
  switch (ex.exception_scope_type) {
    case 'sku':       return ex.exception_scope_id === skuId
    case 'family':    return ex.exception_scope_id === sku.family_id
    case 'subfamily': return ex.exception_scope_id === sku.subfamily_id
    default:          return false
  }
}

// Recursively computes rolled-up cost from a populated BOM tree node
export function computeRolledCost(node: BomTreeNode): number {
  const ownCost = (node.resolvedUnitCost ?? 0) * node.line.quantity
  const childrenCost = node.children.reduce((sum, child) => sum + computeRolledCost(child), 0)
  return ownCost + childrenCost
}

// Computes the total inventory value for a set of lines
export function computeInventoryTotals(lines: { quantity: number; unit_cost: number | null }[]): {
  totalValue: number
  missingCostCount: number
  totalQuantity: number
} {
  let totalValue = 0
  let missingCostCount = 0
  let totalQuantity = 0
  for (const line of lines) {
    totalQuantity += line.quantity
    if (line.unit_cost === null || line.unit_cost === undefined) {
      missingCostCount++
    } else {
      totalValue += line.quantity * line.unit_cost
    }
  }
  return { totalValue, missingCostCount, totalQuantity }
}

// Builds the aggregation key for inventory valuation results
export function buildAggregationKey(
  type: 'global' | 'warehouse' | 'family_subfamily',
  warehouseId?: string | null,
  familyId?: string | null,
  subfamilyId?: string | null
): string {
  return [type, warehouseId ?? '', familyId ?? '', subfamilyId ?? ''].join('|')
}
