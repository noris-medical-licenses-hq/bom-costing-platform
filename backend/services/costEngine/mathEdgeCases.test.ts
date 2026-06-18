// Additional edge case tests for math.ts pure functions
// Exercises boundary conditions, type coercion, and combined operator chains
import { describe, it, expect } from 'vitest'
import {
  applyAction,
  evaluateSingleCondition,
  evaluateConditions,
  exceptionAppliesToSku,
  computeRolledCost,
  buildAggregationKey,
  getSkuField,
} from './math'
import type { BomTreeNode } from './types'
import { IDS, makeSku, makeCondition, makeAction, makeException, makeBomLine } from '../../__fixtures__'

// ─── applyAction edge cases ───────────────────────────────────────────────────

describe('applyAction — edge cases', () => {
  it('add_percentage with 0% is identity', () => {
    const a = makeAction({ action_type: 'add_percentage', action_value: 0 })
    expect(applyAction(a, 50)).toBeCloseTo(50)
  })

  it('add_percentage with null value treated as 0%', () => {
    const a = makeAction({ action_type: 'add_percentage', action_value: null })
    expect(applyAction(a, 100)).toBeCloseTo(100)
  })

  it('add_fixed with negative value reduces cost', () => {
    const a = makeAction({ action_type: 'add_fixed', action_value: -15 })
    expect(applyAction(a, 100)).toBeCloseTo(85)
  })

  it('multiply by 2 doubles the cost', () => {
    const a = makeAction({ action_type: 'multiply', action_value: 2 })
    expect(applyAction(a, 75)).toBeCloseTo(150)
  })

  it('multiply with null value treated as ×1', () => {
    const a = makeAction({ action_type: 'multiply', action_value: null })
    expect(applyAction(a, 50)).toBeCloseTo(50)
  })

  it('cap_at_value when below cap → unchanged', () => {
    const a = makeAction({ action_type: 'cap_at_value', action_value: 200 })
    expect(applyAction(a, 150)).toBeCloseTo(150)
  })

  it('floor_at_value when above floor → unchanged', () => {
    const a = makeAction({ action_type: 'floor_at_value', action_value: 50 })
    expect(applyAction(a, 100)).toBeCloseTo(100)
  })

  it('floor_at_value when below floor → raises to floor', () => {
    const a = makeAction({ action_type: 'floor_at_value', action_value: 50 })
    expect(applyAction(a, 30)).toBeCloseTo(50)
  })

  it('unknown action_type → identity (passthrough)', () => {
    const a = makeAction({ action_type: 'unknown_future_type', action_value: 99 })
    expect(applyAction(a, 42)).toBeCloseTo(42)
  })
})

// ─── evaluateSingleCondition — operator edge cases ───────────────────────────

describe('evaluateSingleCondition — edge cases', () => {
  const sku = makeSku({ family_id: IDS.family.window, subfamily_id: IDS.subfamily.pvc })

  it('in operator matches one of several comma-separated values', () => {
    const cond = makeCondition({ condition_field: 'sku.family_id', condition_operator: 'in', condition_value: `${IDS.family.door},${IDS.family.window}` })
    expect(evaluateSingleCondition(cond, sku)).toBe(true)
  })

  it('in operator does not match when value not in list', () => {
    const cond = makeCondition({ condition_field: 'sku.family_id', condition_operator: 'in', condition_value: `${IDS.family.door},${IDS.family.glass}` })
    expect(evaluateSingleCondition(cond, sku)).toBe(false)
  })

  it('not_in returns true when value is absent from list', () => {
    const cond = makeCondition({ condition_field: 'sku.family_id', condition_operator: 'not_in', condition_value: `${IDS.family.door},${IDS.family.glass}` })
    expect(evaluateSingleCondition(cond, sku)).toBe(true)
  })

  it('greater_than with numeric field', () => {
    const skuWithLeadTime = makeSku({ lead_time_days: 30 })
    const cond = makeCondition({ condition_field: 'sku.lead_time_days', condition_operator: 'greater_than', condition_value: '20' })
    expect(evaluateSingleCondition(cond, skuWithLeadTime)).toBe(true)
  })

  it('less_than with numeric field', () => {
    const skuWithLeadTime = makeSku({ lead_time_days: 5 })
    const cond = makeCondition({ condition_field: 'sku.lead_time_days', condition_operator: 'less_than', condition_value: '10' })
    expect(evaluateSingleCondition(cond, skuWithLeadTime)).toBe(true)
  })

  it('is_null returns true for null field', () => {
    const skuNoFamily = makeSku({ family_id: null })
    const cond = makeCondition({ condition_field: 'sku.family_id', condition_operator: 'is_null', condition_value: '' })
    expect(evaluateSingleCondition(cond, skuNoFamily)).toBe(true)
  })

  it('is_not_null returns false for null field', () => {
    const skuNoFamily = makeSku({ family_id: null })
    const cond = makeCondition({ condition_field: 'sku.family_id', condition_operator: 'is_not_null', condition_value: '' })
    expect(evaluateSingleCondition(cond, skuNoFamily)).toBe(false)
  })

  it('is_not_null returns true when field has value', () => {
    const cond = makeCondition({ condition_field: 'sku.family_id', condition_operator: 'is_not_null', condition_value: '' })
    expect(evaluateSingleCondition(cond, sku)).toBe(true)
  })

  it('unknown operator returns false', () => {
    const cond = makeCondition({ condition_field: 'sku.family_id', condition_operator: 'contains' as never, condition_value: 'win' })
    expect(evaluateSingleCondition(cond, sku)).toBe(false)
  })

  it('field from unknown table namespace returns undefined → treated as null', () => {
    const cond = makeCondition({ condition_field: 'other_table.field', condition_operator: 'is_null', condition_value: '' })
    expect(evaluateSingleCondition(cond, sku)).toBe(true)
  })
})

// ─── evaluateConditions — AND/OR group logic ─────────────────────────────────

describe('evaluateConditions — multi-group logic', () => {
  const sku = makeSku({ family_id: IDS.family.window, status: 'active' })

  it('two conditions in same group (AND) — both must pass', () => {
    const c1 = makeCondition({ id: 'c1', condition_field: 'sku.family_id',  condition_value: IDS.family.window, logical_group: 1 })
    const c2 = makeCondition({ id: 'c2', condition_field: 'sku.status',     condition_value: 'discontinued',   logical_group: 1 })
    // c1 passes, c2 fails → group 1 fails → overall false
    expect(evaluateConditions([c1, c2], sku)).toBe(false)
  })

  it('two groups (OR) — rule matches if either group passes', () => {
    const c1 = makeCondition({ id: 'c1', condition_field: 'sku.family_id', condition_value: IDS.family.door,   logical_group: 1 })
    const c2 = makeCondition({ id: 'c2', condition_field: 'sku.family_id', condition_value: IDS.family.window, logical_group: 2 })
    // group 1 fails (door ≠ window), group 2 passes → overall true
    expect(evaluateConditions([c1, c2], sku)).toBe(true)
  })

  it('two groups both fail → overall false', () => {
    const c1 = makeCondition({ id: 'c1', condition_field: 'sku.family_id', condition_value: IDS.family.door,  logical_group: 1 })
    const c2 = makeCondition({ id: 'c2', condition_field: 'sku.family_id', condition_value: IDS.family.glass, logical_group: 2 })
    expect(evaluateConditions([c1, c2], sku)).toBe(false)
  })

  it('mixed group: group 1 has two conditions (AND), group 2 has one; first group fails, second passes', () => {
    const c1a = makeCondition({ id: 'c1a', condition_field: 'sku.family_id', condition_value: IDS.family.window,  logical_group: 1 })
    const c1b = makeCondition({ id: 'c1b', condition_field: 'sku.status',    condition_value: 'discontinued',     logical_group: 1 })
    const c2  = makeCondition({ id: 'c2',  condition_field: 'sku.family_id', condition_value: IDS.family.window,  logical_group: 2 })
    // group 1: c1a ✓ AND c1b ✗ → false; group 2: c2 ✓ → true; overall OR → true
    expect(evaluateConditions([c1a, c1b, c2], sku)).toBe(true)
  })
})

// ─── exceptionAppliesToSku — scope logic ─────────────────────────────────────

describe('exceptionAppliesToSku — all scope types', () => {
  const sku = makeSku({ family_id: IDS.family.window, subfamily_id: IDS.subfamily.pvc })

  it('sku scope: matches when exception_scope_id equals skuId', () => {
    const ex = makeException({ exception_scope_type: 'sku', exception_scope_id: IDS.sku.frame })
    expect(exceptionAppliesToSku(ex, IDS.sku.frame, sku)).toBe(true)
  })

  it('sku scope: does not match different SKU', () => {
    const ex = makeException({ exception_scope_type: 'sku', exception_scope_id: IDS.sku.glass })
    expect(exceptionAppliesToSku(ex, IDS.sku.frame, sku)).toBe(false)
  })

  it('family scope: matches when exception_scope_id equals sku.family_id', () => {
    const ex = makeException({ exception_scope_type: 'family', exception_scope_id: IDS.family.window })
    expect(exceptionAppliesToSku(ex, IDS.sku.frame, sku)).toBe(true)
  })

  it('family scope: does not match different family', () => {
    const ex = makeException({ exception_scope_type: 'family', exception_scope_id: IDS.family.door })
    expect(exceptionAppliesToSku(ex, IDS.sku.frame, sku)).toBe(false)
  })

  it('subfamily scope: matches when exception_scope_id equals sku.subfamily_id', () => {
    const ex = makeException({ exception_scope_type: 'subfamily', exception_scope_id: IDS.subfamily.pvc })
    expect(exceptionAppliesToSku(ex, IDS.sku.frame, sku)).toBe(true)
  })

  it('supplier/warehouse/project scope → returns false (not SKU-level)', () => {
    for (const scopeType of ['supplier', 'warehouse', 'project'] as const) {
      const ex = makeException({ exception_scope_type: scopeType, exception_scope_id: 'some-id' })
      expect(exceptionAppliesToSku(ex, IDS.sku.frame, sku)).toBe(false)
    }
  })
})

// ─── getSkuField ──────────────────────────────────────────────────────────────

describe('getSkuField', () => {
  const sku = makeSku({
    family_id: IDS.family.window,
    subfamily_id: IDS.subfamily.pvc,
    status: 'active',
    make_buy: 'make',
  })

  it('resolves sku.family_id', () => {
    expect(getSkuField('sku.family_id', sku)).toBe(IDS.family.window)
  })

  it('resolves sku.subfamily_id', () => {
    expect(getSkuField('sku.subfamily_id', sku)).toBe(IDS.subfamily.pvc)
  })

  it('resolves sku.status', () => {
    expect(getSkuField('sku.status', sku)).toBe('active')
  })

  it('resolves sku.make_buy', () => {
    expect(getSkuField('sku.make_buy', sku)).toBe('make')
  })

  it('returns undefined for unknown sku column', () => {
    expect(getSkuField('sku.nonexistent_column', sku)).toBeUndefined()
  })

  it('returns undefined for non-sku namespace', () => {
    expect(getSkuField('bom.quantity', sku)).toBeUndefined()
  })
})

// ─── buildAggregationKey ──────────────────────────────────────────────────────

describe('buildAggregationKey — all combinations', () => {
  it('global key has empty warehouse/family/subfamily segments', () => {
    expect(buildAggregationKey('global')).toBe('global|||')
  })

  it('warehouse key includes warehouseId', () => {
    expect(buildAggregationKey('warehouse', IDS.warehouse.berlin)).toBe(`warehouse|${IDS.warehouse.berlin}||`)
  })

  it('family_subfamily key includes familyId and subfamilyId', () => {
    expect(buildAggregationKey('family_subfamily', null, IDS.family.window, IDS.subfamily.pvc))
      .toBe(`family_subfamily||${IDS.family.window}|${IDS.subfamily.pvc}`)
  })

  it('two global keys are identical (deterministic)', () => {
    expect(buildAggregationKey('global')).toBe(buildAggregationKey('global'))
  })

  it('warehouse keys differ between warehouses', () => {
    const keyA = buildAggregationKey('warehouse', IDS.warehouse.berlin)
    const keyB = buildAggregationKey('warehouse', IDS.warehouse.munich)
    expect(keyA).not.toBe(keyB)
  })

  it('family_subfamily keys differ between families', () => {
    const keyA = buildAggregationKey('family_subfamily', null, IDS.family.window, IDS.subfamily.pvc)
    const keyB = buildAggregationKey('family_subfamily', null, IDS.family.door,   IDS.subfamily.alum)
    expect(keyA).not.toBe(keyB)
  })
})

// ─── computeRolledCost — fractional quantities ───────────────────────────────

describe('computeRolledCost — fractional quantities', () => {
  function makeNode(resolvedUnitCost: number, quantity: number, children: BomTreeNode[] = []): BomTreeNode {
    return {
      line: makeBomLine({ quantity }),
      sku: null,
      virtualComponent: null,
      children,
      resolvedUnitCost,
      rolledCost: null,
      costSource: null,
      appliedRules: [],
      appliedExceptions: [],
    }
  }

  it('fractional quantity: 1.5 units of a 10-cost item = 15', () => {
    expect(computeRolledCost(makeNode(10, 1.5))).toBeCloseTo(15)
  })

  it('fractional unit cost: 3.333 × 3 = 9.999', () => {
    expect(computeRolledCost(makeNode(3.333, 3))).toBeCloseTo(9.999)
  })

  it('zero unit cost leaf contributes nothing', () => {
    const child = makeNode(0, 100)
    const parent = makeNode(50, 1, [child])
    expect(computeRolledCost(parent)).toBeCloseTo(50)
  })

  it('node with null resolvedUnitCost is treated as 0', () => {
    const node = makeNode(null as never, 5)
    expect(computeRolledCost(node)).toBeCloseTo(0)
  })
})
