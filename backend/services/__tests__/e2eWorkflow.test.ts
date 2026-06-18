// E2E Workflow Scaffold — full happy-path and error-path scenarios
// Tests the pure computation chains that power each phase of the workflow.
// Does NOT require a live Supabase connection.
// Phase 2: will be extended with mocked repository integration tests.
import { describe, it, expect } from 'vitest'
import {
  applyAction,
  evaluateConditions,
  exceptionAppliesToSku,
  computeRolledCost,
  computeInventoryTotals,
  buildAggregationKey,
} from '../costEngine/math'
import type { BomTreeNode } from '../costEngine/types'
import {
  IDS,
  makeSku,
  makeCondition,
  makeAction,
  makeException,
  makeBomLine,
} from '../../__fixtures__'

// ─── SCENARIO 1: Buy item — direct cost from supplier price ───────────────────

describe('Workflow: buy item cost resolution', () => {
  const buySku = makeSku({ id: IDS.sku.glass, make_buy: 'buy', family_id: IDS.family.glass })

  it('no conditions → rule applies universally', () => {
    // Empty conditions list means the rule matches everything
    const result = evaluateConditions([], buySku)
    expect(result).toBe(true)
  })

  it('family condition restricts rule to glass family', () => {
    const cond = makeCondition({ condition_field: 'sku.family_id', condition_value: IDS.family.glass })
    expect(evaluateConditions([cond], buySku)).toBe(true)
  })

  it('family condition blocks rule for window SKU', () => {
    const windowSku = makeSku({ family_id: IDS.family.window })
    const cond = makeCondition({ condition_field: 'sku.family_id', condition_value: IDS.family.glass })
    expect(evaluateConditions([cond], windowSku)).toBe(false)
  })

  it('markup rule applied to buy-item cost', () => {
    const baseSupplierCost = 25.00
    const action = makeAction({ action_type: 'add_percentage', action_value: 15 })
    const final = applyAction(action, baseSupplierCost)
    expect(final).toBeCloseTo(28.75)
  })

  it('cap rule limits cost even after markup', () => {
    const afterMarkup = 28.75
    const cap = makeAction({ action_type: 'cap_at_value', action_value: 27.00 })
    expect(applyAction(cap, afterMarkup)).toBeCloseTo(27.00)
  })
})

// ─── SCENARIO 2: Make item — BOM rollup ──────────────────────────────────────

describe('Workflow: make item BOM rollup', () => {
  function node(cost: number, qty: number, children: BomTreeNode[] = []): BomTreeNode {
    return { line: makeBomLine({ quantity: qty }), sku: null, virtualComponent: null, children, resolvedUnitCost: cost, rolledCost: null, costSource: null, appliedRules: [], appliedExceptions: [] }
  }

  it('single-component BOM: frame only', () => {
    const frame = node(12.50, 2)  // 2× frame at 12.50 each = 25
    expect(computeRolledCost(frame)).toBeCloseTo(25)
  })

  it('multi-component BOM: frame + glass + seal', () => {
    const frame = node(12.50, 2)  // 25.00
    const glass = node(8.00, 1)   //  8.00
    const seal  = node(0.50, 4)   //  2.00
    const assembly = node(5.00, 1, [frame, glass, seal])  // 5 + 25 + 8 + 2 = 40
    expect(computeRolledCost(assembly)).toBeCloseTo(40)
  })

  it('nested BOM: frame sub-assembly has own components', () => {
    // computeRolledCost = own (unitCost × qty) + sum of children's rolledCosts
    // pvcProfile: 3.00 × 4 = 12.00
    // corner:     0.80 × 4 =  3.20
    // frame own:  2.00 × 2 =  4.00 → frame total = 4 + 12 + 3.2 = 19.2
    // assembly:  10.00 × 1 = 10.00 → assembly total = 10 + 19.2 = 29.2
    const pvcProfile = node(3.00, 4)
    const corner     = node(0.80, 4)
    const frame      = node(2.00, 2, [pvcProfile, corner])
    const assembly   = node(10.00, 1, [frame])
    expect(computeRolledCost(assembly)).toBeCloseTo(29.2)
  })

  it('make item: adding overhead rule to rolled cost', () => {
    const bomCost = 40.00
    const overhead = makeAction({ action_type: 'add_percentage', action_value: 20 })
    expect(applyAction(overhead, bomCost)).toBeCloseTo(48.00)
  })

  it('exclude_from_rollup removes component cost', () => {
    const toolingFee = makeAction({ action_type: 'exclude_from_rollup' })
    const cost = applyAction(toolingFee, 500.00)
    expect(cost).toBe(0)  // excluded, contributes nothing to parent rollup
  })
})

// ─── SCENARIO 3: Rule with exception suppression ──────────────────────────────

describe('Workflow: rule exception suppresses markup', () => {
  const windowSku = makeSku({ family_id: IDS.family.window, subfamily_id: IDS.subfamily.pvc })

  it('condition matches → rule would normally apply', () => {
    const cond = makeCondition({ condition_field: 'sku.family_id', condition_value: IDS.family.window })
    expect(evaluateConditions([cond], windowSku)).toBe(true)
  })

  it('sku-level exception suppresses the rule for this specific SKU', () => {
    const ex = makeException({ exception_scope_type: 'sku', exception_scope_id: IDS.sku.frame })
    expect(exceptionAppliesToSku(ex, IDS.sku.frame, windowSku)).toBe(true)
  })

  it('same exception does not suppress rule for a different SKU', () => {
    const ex = makeException({ exception_scope_type: 'sku', exception_scope_id: IDS.sku.frame })
    expect(exceptionAppliesToSku(ex, IDS.sku.glass, windowSku)).toBe(false)
  })

  it('family exception suppresses all SKUs in the family', () => {
    const ex = makeException({ exception_scope_type: 'family', exception_scope_id: IDS.family.window })
    const skuA = makeSku({ id: IDS.sku.frame, family_id: IDS.family.window })
    const skuB = makeSku({ id: IDS.sku.glass, family_id: IDS.family.window })
    expect(exceptionAppliesToSku(ex, IDS.sku.frame, skuA)).toBe(true)
    expect(exceptionAppliesToSku(ex, IDS.sku.glass, skuB)).toBe(true)
  })

  it('family exception does not affect SKUs in another family', () => {
    const ex = makeException({ exception_scope_type: 'family', exception_scope_id: IDS.family.window })
    const doorSku = makeSku({ id: IDS.sku.frame, family_id: IDS.family.door })
    expect(exceptionAppliesToSku(ex, IDS.sku.frame, doorSku)).toBe(false)
  })

  it('when exception applies: cost stays at base (no markup)', () => {
    const baseCost = 100
    const markup = makeAction({ action_type: 'add_percentage', action_value: 25 })
    const ex = makeException({ exception_scope_type: 'sku', exception_scope_id: IDS.sku.frame })

    const exceptionApplies = exceptionAppliesToSku(ex, IDS.sku.frame, windowSku)
    const finalCost = exceptionApplies ? baseCost : applyAction(markup, baseCost)
    expect(finalCost).toBe(100)  // exception suppressed the markup
  })
})

// ─── SCENARIO 4: Inventory valuation aggregation ──────────────────────────────

describe('Workflow: inventory valuation totals', () => {
  it('single line: total = qty × cost', () => {
    const result = computeInventoryTotals([{ quantity: 50, unit_cost: 12.50 }])
    expect(result.totalValue).toBeCloseTo(625)
    expect(result.totalQuantity).toBe(50)
    expect(result.missingCostCount).toBe(0)
  })

  it('multiple lines: totals are summed', () => {
    const lines = [
      { quantity: 100, unit_cost: 5.00 },   // 500
      { quantity: 50,  unit_cost: 20.00 },  // 1000
      { quantity: 25,  unit_cost: 8.00 },   // 200
    ]
    const result = computeInventoryTotals(lines)
    expect(result.totalValue).toBeCloseTo(1700)
    expect(result.totalQuantity).toBe(175)
    expect(result.missingCostCount).toBe(0)
  })

  it('zero quantity line: contributes 0 value', () => {
    const result = computeInventoryTotals([{ quantity: 0, unit_cost: 100 }])
    expect(result.totalValue).toBe(0)
    expect(result.totalQuantity).toBe(0)
  })

  it('missing cost: counted but excluded from total', () => {
    const lines = [
      { quantity: 10, unit_cost: 5.00 },
      { quantity: 20, unit_cost: null },  // missing cost
    ]
    const result = computeInventoryTotals(lines)
    expect(result.totalValue).toBeCloseTo(50)
    expect(result.missingCostCount).toBe(1)
    expect(result.totalQuantity).toBe(30)
  })

  it('aggregation keys are unique per grouping level', () => {
    const globalKey   = buildAggregationKey('global')
    const warehouseKey = buildAggregationKey('warehouse', IDS.warehouse.berlin)
    const familyKey    = buildAggregationKey('family_subfamily', null, IDS.family.window, IDS.subfamily.pvc)

    const keys = new Set([globalKey, warehouseKey, familyKey])
    expect(keys.size).toBe(3)  // all unique
  })

  it('multiple warehouses produce distinct keys', () => {
    const berlin = buildAggregationKey('warehouse', IDS.warehouse.berlin)
    const munich  = buildAggregationKey('warehouse', IDS.warehouse.munich)
    expect(berlin).not.toBe(munich)
  })

  it('all-missing-cost snapshot: total = 0, all counted as missing', () => {
    const lines = [
      { quantity: 100, unit_cost: null },
      { quantity: 50,  unit_cost: null },
    ]
    const result = computeInventoryTotals(lines)
    expect(result.totalValue).toBe(0)
    expect(result.missingCostCount).toBe(2)
    expect(result.totalQuantity).toBe(150)
  })
})

// ─── SCENARIO 5: Validation → costing gate ───────────────────────────────────

describe('Workflow: validation gates costing', () => {
  it('rule with family condition only fires for matching SKUs', () => {
    const windowSku = makeSku({ family_id: IDS.family.window })
    const doorSku   = makeSku({ family_id: IDS.family.door })
    const glassSku  = makeSku({ family_id: IDS.family.glass })

    const cond = makeCondition({ condition_field: 'sku.family_id', condition_value: IDS.family.window })

    expect(evaluateConditions([cond], windowSku)).toBe(true)
    expect(evaluateConditions([cond], doorSku)).toBe(false)
    expect(evaluateConditions([cond], glassSku)).toBe(false)
  })

  it('rule with status condition: only active SKUs get markup', () => {
    const active      = makeSku({ status: 'active' })
    const discontinued = makeSku({ status: 'discontinued' })
    const draft       = makeSku({ status: 'draft' })

    const cond = makeCondition({ condition_field: 'sku.status', condition_value: 'active' })

    expect(evaluateConditions([cond], active)).toBe(true)
    expect(evaluateConditions([cond], discontinued)).toBe(false)
    expect(evaluateConditions([cond], draft)).toBe(false)
  })

  it('multi-rule chain applies in priority order — higher priority fires first', () => {
    let cost = 100.00

    // Rule 1 (priority 1): +20% markup for window family
    const windowSku = makeSku({ family_id: IDS.family.window })
    const cond1 = makeCondition({ condition_field: 'sku.family_id', condition_value: IDS.family.window })
    const action1 = makeAction({ action_type: 'add_percentage', action_value: 20 })
    if (evaluateConditions([cond1], windowSku)) cost = applyAction(action1, cost)
    expect(cost).toBeCloseTo(120)  // after rule 1

    // Rule 2 (priority 2): cap at 115
    const action2 = makeAction({ action_type: 'cap_at_value', action_value: 115 })
    cost = applyAction(action2, cost)
    expect(cost).toBeCloseTo(115)  // capped
  })
})
