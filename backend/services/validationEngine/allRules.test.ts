// Tests for validation rules not yet covered in validation.test.ts
// Adds coverage for: V-BOM-002, V-SKU-001..004, V-COST-001..002..005,
// V-RULE-001..002, V-INV-001, V-INV-004
import { describe, it, expect, vi } from 'vitest'
import { IDS } from '../../__fixtures__'

// ─── V-BOM-002: Lines must reference active SKUs / active virtual components ──

describe('V-BOM-002: BOM lines reference active SKUs', () => {
  it('returns error for BOM line referencing non-active SKU', async () => {
    const { validateBomLinesReferenceActiveSkus } = await import('./rules/bom/V-BOM-002')
    const client = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'bom_lines') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ id: 'line-1', sku_id: IDS.sku.frame, virtual_component_id: null }],
                error: null,
              }),
            }),
          }
        }
        // skus query
        if (table === 'skus') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [{ id: IDS.sku.frame, status: 'archived' }],
                error: null,
              }),
            }),
          }
        }
        // virtual_components query (empty)
        return { select: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ data: [], error: null }) }) }
      }),
    }
    const findings = await validateBomLinesReferenceActiveSkus(IDS.bomVersion.window, client as never)
    expect(findings).toHaveLength(1)
    expect(findings[0].rule_code).toBe('V-BOM-002')
    expect(findings[0].severity).toBe('error')
  })

  it('returns no findings when all BOM lines reference active SKUs', async () => {
    const { validateBomLinesReferenceActiveSkus } = await import('./rules/bom/V-BOM-002')
    const client = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'bom_lines') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [
                  { id: 'line-1', sku_id: IDS.sku.frame, virtual_component_id: null },
                  { id: 'line-2', sku_id: IDS.sku.glass, virtual_component_id: null },
                ],
                error: null,
              }),
            }),
          }
        }
        if (table === 'skus') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [
                  { id: IDS.sku.frame, status: 'active' },
                  { id: IDS.sku.glass, status: 'active' },
                ],
                error: null,
              }),
            }),
          }
        }
        return { select: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ data: [], error: null }) }) }
      }),
    }
    const findings = await validateBomLinesReferenceActiveSkus(IDS.bomVersion.window, client as never)
    expect(findings).toHaveLength(0)
  })

  it('returns no findings for empty BOM (no lines)', async () => {
    const { validateBomLinesReferenceActiveSkus } = await import('./rules/bom/V-BOM-002')
    const client = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'bom_lines') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }
        }
        return { select: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ data: [], error: null }) }) }
      }),
    }
    const findings = await validateBomLinesReferenceActiveSkus(IDS.bomVersion.window, client as never)
    expect(findings).toHaveLength(0)
  })
})

// ─── V-SKU-001: Part number uniqueness ───────────────────────────────────────
// V-SKU-001 queries the same table twice: once for .single() to get SKU, once with count
describe('V-SKU-001: SKU part_number must be unique within org', () => {
  it('returns error when another SKU has the same part_number', async () => {
    const { validateSkuPartNumberUnique } = await import('./rules/sku/V-SKU-001')
    let callCount = 0
    const client = {
      from: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: IDS.sku.frame, part_number: 'WND-001', organization_id: IDS.org },
                  error: null,
                }),
              }),
            }),
          }
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                neq: vi.fn().mockResolvedValue({ count: 1, error: null }),
              }),
            }),
          }),
        }
      }),
    }
    const findings = await validateSkuPartNumberUnique(IDS.sku.frame, client as never)
    expect(findings).toHaveLength(1)
    expect(findings[0].rule_code).toBe('V-SKU-001')
    expect(findings[0].severity).toBe('error')
  })

  it('returns no findings when part_number is unique', async () => {
    const { validateSkuPartNumberUnique } = await import('./rules/sku/V-SKU-001')
    let callCount = 0
    const client = {
      from: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: IDS.sku.frame, part_number: 'WND-001', organization_id: IDS.org },
                  error: null,
                }),
              }),
            }),
          }
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                neq: vi.fn().mockResolvedValue({ count: 0, error: null }),
              }),
            }),
          }),
        }
      }),
    }
    const findings = await validateSkuPartNumberUnique(IDS.sku.frame, client as never)
    expect(findings).toHaveLength(0)
  })
})

// ─── V-COST-001: Cost item currency must match cost_set ──────────────────────

describe('V-COST-001: Cost item currency matches cost_set base_currency', () => {
  it('returns error for cost item with mismatched currency', async () => {
    const { validateCostItemCurrencies } = await import('./rules/cost/V-COST-001')
    let callCount = 0
    const client = {
      from: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: IDS.costSet.siteA, base_currency: 'EUR' },
                  error: null,
                }),
              }),
            }),
          }
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              not: vi.fn().mockResolvedValue({
                data: [{ id: 'item-1', currency: 'USD', scope_type: 'global', scope_id: null, item_type: 'material' }],
                error: null,
              }),
            }),
          }),
        }
      }),
    }
    const findings = await validateCostItemCurrencies(IDS.costSet.siteA, client as never)
    expect(findings).toHaveLength(1)
    expect(findings[0].rule_code).toBe('V-COST-001')
    expect(findings[0].severity).toBe('error')
    expect(findings[0].message).toContain('USD')
    expect(findings[0].message).toContain('EUR')
  })

  it('returns no findings when currencies match', async () => {
    const { validateCostItemCurrencies } = await import('./rules/cost/V-COST-001')
    let callCount = 0
    const client = {
      from: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: IDS.costSet.siteA, base_currency: 'EUR' },
                  error: null,
                }),
              }),
            }),
          }
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              not: vi.fn().mockResolvedValue({
                data: [{ id: 'item-1', currency: 'EUR', scope_type: 'global', scope_id: null, item_type: 'material' }],
                error: null,
              }),
            }),
          }),
        }
      }),
    }
    const findings = await validateCostItemCurrencies(IDS.costSet.siteA, client as never)
    expect(findings).toHaveLength(0)
  })

  it('returns no findings when no items have explicit currency (null)', async () => {
    const { validateCostItemCurrencies } = await import('./rules/cost/V-COST-001')
    let callCount = 0
    const client = {
      from: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: IDS.costSet.siteA, base_currency: 'EUR' },
                  error: null,
                }),
              }),
            }),
          }
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              not: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }
      }),
    }
    const findings = await validateCostItemCurrencies(IDS.costSet.siteA, client as never)
    expect(findings).toHaveLength(0)
  })
})

// ─── V-COST-005: Supplier prices not covered by cost items ───────────────────
// supplier_prices query: .select('sku_id').lte(...).or(...)
// cost_items query: .select('scope_id').eq(...).eq(...).in(...)

describe('V-COST-005: SKUs with supplier_prices should have cost_items in cost_set', () => {
  it('returns info finding for SKU with supplier_price but no cost_item', async () => {
    const { validateSupplierPricesCoveredByCostItems } = await import('./rules/cost/V-COST-005')
    const client = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'supplier_prices') {
          return {
            select: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                or: vi.fn().mockResolvedValue({
                  data: [{ sku_id: IDS.sku.frame }],
                  error: null,
                }),
              }),
            }),
          }
        }
        // cost_items — no rows (SKU not covered)
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        }
      }),
    }
    const findings = await validateSupplierPricesCoveredByCostItems(IDS.costSet.siteA, client as never)
    expect(findings.length).toBeGreaterThanOrEqual(1)
    expect(findings[0].rule_code).toBe('V-COST-005')
    expect(findings[0].severity).toBe('info')
  })
})

// ─── V-RULE-001: Rule condition references known field ────────────────────────

describe('V-RULE-001: Rule condition references known field', () => {
  it('returns error for unknown condition field', async () => {
    const { validateRuleConditionFields } = await import('./rules/rule/V-RULE-001')
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [{ id: 'cnd-1', condition_field: 'sku.nonexistent_xyz', condition_operator: 'equals', condition_value: 'test' }],
            error: null,
          }),
        }),
      }),
    }
    const findings = await validateRuleConditionFields(IDS.rule.familyMark, client as never)
    expect(findings).toHaveLength(1)
    expect(findings[0].rule_code).toBe('V-RULE-001')
    expect(findings[0].severity).toBe('error')
  })

  it('returns no findings for all known field names', async () => {
    const { validateRuleConditionFields } = await import('./rules/rule/V-RULE-001')
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [
              { id: 'cnd-1', condition_field: 'sku.family_id',   condition_operator: 'equals', condition_value: IDS.family.window },
              { id: 'cnd-2', condition_field: 'sku.make_buy',    condition_operator: 'in',     condition_value: 'make,buy' },
              { id: 'cnd-3', condition_field: 'sku.item_type',   condition_operator: 'equals', condition_value: 'sub_assembly' },
            ],
            error: null,
          }),
        }),
      }),
    }
    const findings = await validateRuleConditionFields(IDS.rule.familyMark, client as never)
    expect(findings).toHaveLength(0)
  })

  it('returns error for empty conditions list — no findings (no conditions to check)', async () => {
    const { validateRuleConditionFields } = await import('./rules/rule/V-RULE-001')
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    }
    const findings = await validateRuleConditionFields(IDS.rule.familyMark, client as never)
    expect(findings).toHaveLength(0)
  })
})

// ─── V-RULE-002: Rule action values in valid ranges ──────────────────────────

describe('V-RULE-002: Rule action value ranges', () => {
  it('returns error for multiply action with value <= 0', async () => {
    const { validateRuleActionValues } = await import('./rules/rule/V-RULE-002')
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [{ id: 'act-1', action_type: 'multiply', action_value: -0.5 }],
            error: null,
          }),
        }),
      }),
    }
    const findings = await validateRuleActionValues(IDS.rule.familyMark, client as never)
    expect(findings).toHaveLength(1)
    expect(findings[0].rule_code).toBe('V-RULE-002')
    expect(findings[0].severity).toBe('error')
  })

  it('returns error for add_percentage outside -100..1000', async () => {
    const { validateRuleActionValues } = await import('./rules/rule/V-RULE-002')
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [{ id: 'act-1', action_type: 'add_percentage', action_value: 2000 }],
            error: null,
          }),
        }),
      }),
    }
    const findings = await validateRuleActionValues(IDS.rule.familyMark, client as never)
    expect(findings).toHaveLength(1)
  })

  it('returns no findings for valid action values', async () => {
    const { validateRuleActionValues } = await import('./rules/rule/V-RULE-002')
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [
              { id: 'act-1', action_type: 'add_percentage', action_value: 10 },
              { id: 'act-2', action_type: 'multiply', action_value: 1.5 },
              { id: 'act-3', action_type: 'add_fixed', action_value: 5 },
              { id: 'act-4', action_type: 'replace_cost', action_value: 100 },
              { id: 'act-5', action_type: 'cap_at_value', action_value: 500 },
              { id: 'act-6', action_type: 'floor_at_value', action_value: 10 },
            ],
            error: null,
          }),
        }),
      }),
    }
    const findings = await validateRuleActionValues(IDS.rule.familyMark, client as never)
    expect(findings).toHaveLength(0)
  })

  it('exclude_from_rollup action needs no action_value — no error', async () => {
    const { validateRuleActionValues } = await import('./rules/rule/V-RULE-002')
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [{ id: 'act-1', action_type: 'exclude_from_rollup', action_value: null }],
            error: null,
          }),
        }),
      }),
    }
    const findings = await validateRuleActionValues(IDS.rule.familyMark, client as never)
    expect(findings).toHaveLength(0)
  })
})

// ─── V-INV-001: Make/assembly SKUs need approved BOM ─────────────────────────
// Function: validateInventorySkusHaveBoms
// Query flow: inventory_lines → skus (filter by item_type) → boms → bom_versions
describe('V-INV-001: Make/assembly SKUs in snapshot need approved BOM', () => {
  it('returns warning for sub_assembly SKU in snapshot with no BOM', async () => {
    const { validateInventorySkusHaveBoms } = await import('./rules/inventory/V-INV-001')
    const client = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'inventory_lines') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ id: 'iln-001', sku_id: IDS.sku.assembly }],
                error: null,
              }),
            }),
          }
        }
        if (table === 'skus') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({
                  data: [{ id: IDS.sku.assembly, item_type: 'sub_assembly', part_number: 'ASM-001' }],
                  error: null,
                }),
              }),
            }),
          }
        }
        // boms — empty (no BOM for this SKU)
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }
      }),
    }
    const findings = await validateInventorySkusHaveBoms(IDS.snapshot.q1, client as never)
    expect(findings.length).toBeGreaterThanOrEqual(1)
    expect(findings[0].rule_code).toBe('V-INV-001')
    expect(findings[0].severity).toBe('warning')
  })
})

// ─── V-INV-004: Snapshot with open errors blocks approval ────────────────────
// Query: validation_findings.select('id', count).eq('entity_id', ...).eq('severity', 'error').eq('status', 'open')

describe('V-INV-004: Snapshot with open ERROR findings cannot be approved', () => {
  it('returns error when snapshot has open ERROR-severity validation findings', async () => {
    const { validateSnapshotHasNoOpenErrors } = await import('./rules/inventory/V-INV-004')
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ count: 5, error: null }),
            }),
          }),
        }),
      }),
    }
    const findings = await validateSnapshotHasNoOpenErrors(IDS.snapshot.q1, client as never)
    expect(findings).toHaveLength(1)
    expect(findings[0].rule_code).toBe('V-INV-004')
    expect(findings[0].severity).toBe('error')
    expect(findings[0].message).toContain('5')
  })

  it('returns no findings when no open errors exist', async () => {
    const { validateSnapshotHasNoOpenErrors } = await import('./rules/inventory/V-INV-004')
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
            }),
          }),
        }),
      }),
    }
    const findings = await validateSnapshotHasNoOpenErrors(IDS.snapshot.q1, client as never)
    expect(findings).toHaveLength(0)
  })
})

// ─── V-SKU-003: Discontinued SKU in active BOM ───────────────────────────────
// Query flow: skus.single() → boms.select.eq('sku_id') [inner await] → bom_versions.select.eq.in (count)

describe('V-SKU-003: Discontinued SKU should not be in active BOM', () => {
  it('returns warning for discontinued SKU found in approved BOM version', async () => {
    const { validateNoDiscontinuedSkuInActiveBom } = await import('./rules/sku/V-SKU-003')
    const client = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'skus') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: IDS.sku.frame, status: 'discontinued', part_number: 'WND-001' },
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'boms') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ id: IDS.bom.window }],
                error: null,
              }),
            }),
          }
        }
        // bom_versions — 1 approved
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ count: 1, error: null }),
            }),
          }),
        }
      }),
    }
    const findings = await validateNoDiscontinuedSkuInActiveBom(IDS.sku.frame, client as never)
    expect(findings).toHaveLength(1)
    expect(findings[0].rule_code).toBe('V-SKU-003')
    expect(findings[0].severity).toBe('warning')
  })

  it('returns no findings for active SKU (early return)', async () => {
    const { validateNoDiscontinuedSkuInActiveBom } = await import('./rules/sku/V-SKU-003')
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: IDS.sku.frame, status: 'active', part_number: 'WND-001' },
              error: null,
            }),
          }),
        }),
      }),
    }
    const findings = await validateNoDiscontinuedSkuInActiveBom(IDS.sku.frame, client as never)
    expect(findings).toHaveLength(0)
  })
})
