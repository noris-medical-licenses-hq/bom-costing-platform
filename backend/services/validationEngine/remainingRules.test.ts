// Tests for validation rules not covered in validation.test.ts or allRules.test.ts
// Covers: V-BOM-005, V-BOM-006, V-BOM-007, V-COST-002, V-SKU-002, V-SKU-004
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { validateNoBomCycle } from './rules/bom/V-BOM-005'
import { validateNoBomLinesWithArchivedSkus } from './rules/bom/V-BOM-006'
import { validateSubAssemblyMakeBuy } from './rules/bom/V-BOM-007'
import { validateNoCostItemDateOverlap } from './rules/cost/V-COST-002'
import { validateSkuSubfamilyBelongsToFamily } from './rules/sku/V-SKU-002'
import { validateSkuHasActiveCost } from './rules/sku/V-SKU-004'
import { IDS, makeBomLine } from '../../__fixtures__'

function makeClient(tableMocks: Record<string, unknown>) {
  return {
    from: vi.fn((table: string) => tableMocks[table] ?? { select: vi.fn().mockReturnThis() }),
  }
}

// ─── V-BOM-005: BOM cycle detection ─────────────────────────────────────────

describe('V-BOM-005: BOM must not contain cycles', () => {
  function makeBomChain(rows: unknown[]) {
    // listBomLines calls .select('*').eq(...).order('depth').order('position')
    const innerChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn(),
    }
    // first .order returns another chain with a second .order that resolves
    const secondOrder = { order: vi.fn().mockResolvedValue({ data: rows, error: null }) }
    innerChain.order.mockReturnValue(secondOrder)
    return innerChain
  }

  it('returns no findings when BOM has no cycle', async () => {
    const lineA = makeBomLine({ id: 'line-a', sku_id: IDS.sku.frame, parent_line_id: null })
    const lineB = makeBomLine({ id: 'line-b', sku_id: IDS.sku.glass, parent_line_id: 'line-a' })
    const client = { from: vi.fn().mockReturnValue(makeBomChain([lineA, lineB])) } as never
    const findings = await validateNoBomCycle(IDS.bomVersion.window, client)
    expect(findings).toHaveLength(0)
  })

  it('returns error when BOM contains a cycle', async () => {
    // Cycle: root 'A' → child 'B' → back to 'A' (duplicate id 'A' with parent 'B')
    const lineA = makeBomLine({ id: 'line-a', sku_id: IDS.sku.frame, parent_line_id: null })
    const lineB = makeBomLine({ id: 'line-b', sku_id: IDS.sku.glass, parent_line_id: 'line-a' })
    const lineBackEdge = makeBomLine({ id: 'line-a', sku_id: IDS.sku.seal, parent_line_id: 'line-b' })
    const client = { from: vi.fn().mockReturnValue(makeBomChain([lineA, lineB, lineBackEdge])) } as never
    const findings = await validateNoBomCycle(IDS.bomVersion.window, client)
    expect(findings).toHaveLength(1)
    expect(findings[0].rule_code).toBe('V-BOM-005')
    expect(findings[0].severity).toBe('error')
    expect(findings[0].message).toContain('circular')
  })

  it('returns no findings for empty BOM', async () => {
    const client = { from: vi.fn().mockReturnValue(makeBomChain([])) } as never
    const findings = await validateNoBomCycle(IDS.bomVersion.window, client)
    expect(findings).toHaveLength(0)
  })
})

// ─── V-BOM-006: No archived SKUs in BOM ─────────────────────────────────────

describe('V-BOM-006: BOM lines must not reference archived SKUs', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns error for each BOM line referencing an archived SKU', async () => {
    const lines = [{
      id: 'bln-001',
      sku_id: IDS.sku.frame,
      skus: { id: IDS.sku.frame, part_number: 'WND-FRAME-001', status: 'archived' },
    }]
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockResolvedValue({ data: lines, error: null }),
    }
    const client = { from: vi.fn().mockReturnValue(chain) } as never
    const findings = await validateNoBomLinesWithArchivedSkus(IDS.bomVersion.window, client)
    expect(findings).toHaveLength(1)
    expect(findings[0].rule_code).toBe('V-BOM-006')
    expect(findings[0].severity).toBe('error')
    expect(findings[0].message).toContain('WND-FRAME-001')
  })

  it('returns no findings when all BOM lines reference active SKUs', async () => {
    const lines = [{
      id: 'bln-001',
      sku_id: IDS.sku.frame,
      skus: { id: IDS.sku.frame, part_number: 'WND-FRAME-001', status: 'active' },
    }]
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockResolvedValue({ data: lines, error: null }),
    }
    const client = { from: vi.fn().mockReturnValue(chain) } as never
    const findings = await validateNoBomLinesWithArchivedSkus(IDS.bomVersion.window, client)
    expect(findings).toHaveLength(0)
  })

  it('returns no findings when BOM has no lines', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockResolvedValue({ data: [], error: null }),
    }
    const client = { from: vi.fn().mockReturnValue(chain) } as never
    const findings = await validateNoBomLinesWithArchivedSkus(IDS.bomVersion.window, client)
    expect(findings).toHaveLength(0)
  })
})

// ─── V-BOM-007: Sub-assembly make_buy ───────────────────────────────────────

describe('V-BOM-007: Sub-assembly lines should reference make/make_or_buy SKUs', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns warning for sub-assembly line with buy-only SKU', async () => {
    // line-a is a parent (line-b has parent_line_id = 'line-a')
    const lines = [
      { id: 'line-a', sku_id: IDS.sku.assembly, parent_line_id: null, skus: { id: IDS.sku.assembly, part_number: 'ASSY-001', make_buy: 'buy' } },
      { id: 'line-b', sku_id: IDS.sku.glass,    parent_line_id: 'line-a', skus: { id: IDS.sku.glass, part_number: 'GLS-001', make_buy: 'buy' } },
    ]
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: lines, error: null }),
    }
    const client = { from: vi.fn().mockReturnValue(chain) } as never
    const findings = await validateSubAssemblyMakeBuy(IDS.bomVersion.window, client)
    expect(findings).toHaveLength(1)
    expect(findings[0].rule_code).toBe('V-BOM-007')
    expect(findings[0].severity).toBe('warning')
    expect(findings[0].message).toContain('ASSY-001')
  })

  it('returns no findings when sub-assembly has make SKU', async () => {
    const lines = [
      { id: 'line-a', sku_id: IDS.sku.assembly, parent_line_id: null, skus: { id: IDS.sku.assembly, part_number: 'ASSY-001', make_buy: 'make' } },
      { id: 'line-b', sku_id: IDS.sku.glass,    parent_line_id: 'line-a', skus: { id: IDS.sku.glass, part_number: 'GLS-001', make_buy: 'buy' } },
    ]
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: lines, error: null }),
    }
    const client = { from: vi.fn().mockReturnValue(chain) } as never
    const findings = await validateSubAssemblyMakeBuy(IDS.bomVersion.window, client)
    expect(findings).toHaveLength(0)
  })

  it('returns no findings for flat BOM with no parent lines', async () => {
    const lines = [
      { id: 'line-a', sku_id: IDS.sku.frame,  parent_line_id: null, skus: { id: IDS.sku.frame, part_number: 'FRM-001', make_buy: 'buy' } },
      { id: 'line-b', sku_id: IDS.sku.glass,  parent_line_id: null, skus: { id: IDS.sku.glass, part_number: 'GLS-001', make_buy: 'buy' } },
    ]
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: lines, error: null }),
    }
    const client = { from: vi.fn().mockReturnValue(chain) } as never
    const findings = await validateSubAssemblyMakeBuy(IDS.bomVersion.window, client)
    expect(findings).toHaveLength(0)
  })
})

// ─── V-COST-002: Cost item date overlap ─────────────────────────────────────

describe('V-COST-002: Cost item date ranges must not overlap for the same scope', () => {
  beforeEach(() => { vi.clearAllMocks() })

  function makeChainWithItems(items: unknown[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn((field: string) => {
        if (field === 'effective_from') return Promise.resolve({ data: items, error: null })
        return chain
      }),
    }
    return chain
  }

  it('returns warning for overlapping date ranges in same scope', async () => {
    const items = [
      { id: 'ci-01', item_type: 'material_price', scope_type: 'sku', scope_id: IDS.sku.frame, scope_code: null, effective_from: '2024-01-01', effective_to: '2024-06-30' },
      { id: 'ci-02', item_type: 'material_price', scope_type: 'sku', scope_id: IDS.sku.frame, scope_code: null, effective_from: '2024-06-01', effective_to: '2024-12-31' },
    ]
    const chain = makeChainWithItems(items)
    const client = { from: vi.fn().mockReturnValue(chain) } as never
    const findings = await validateNoCostItemDateOverlap(IDS.costSet.siteA, client)
    expect(findings).toHaveLength(1)
    expect(findings[0].rule_code).toBe('V-COST-002')
    expect(findings[0].severity).toBe('warning')
  })

  it('returns no findings for non-overlapping date ranges', async () => {
    const items = [
      { id: 'ci-01', item_type: 'material_price', scope_type: 'sku', scope_id: IDS.sku.frame, scope_code: null, effective_from: '2024-01-01', effective_to: '2024-05-31' },
      { id: 'ci-02', item_type: 'material_price', scope_type: 'sku', scope_id: IDS.sku.frame, scope_code: null, effective_from: '2024-06-01', effective_to: '2024-12-31' },
    ]
    const chain = makeChainWithItems(items)
    const client = { from: vi.fn().mockReturnValue(chain) } as never
    const findings = await validateNoCostItemDateOverlap(IDS.costSet.siteA, client)
    expect(findings).toHaveLength(0)
  })

  it('returns no findings for a single cost item', async () => {
    const items = [
      { id: 'ci-01', item_type: 'material_price', scope_type: 'global', scope_id: null, scope_code: null, effective_from: '2024-01-01', effective_to: null },
    ]
    const chain = makeChainWithItems(items)
    const client = { from: vi.fn().mockReturnValue(chain) } as never
    const findings = await validateNoCostItemDateOverlap(IDS.costSet.siteA, client)
    expect(findings).toHaveLength(0)
  })
})

// ─── V-SKU-002: Subfamily belongs to family ──────────────────────────────────

describe('V-SKU-002: SKU subfamily must belong to its family', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns error when subfamily belongs to a different family', async () => {
    const sku = {
      id: IDS.sku.frame,
      part_number: 'WND-FRAME-001',
      family_id: IDS.family.window,
      subfamily_id: IDS.subfamily.pvc,
      subfamilies: { id: IDS.subfamily.pvc, family_id: IDS.family.door },  // wrong family!
    }
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: sku, error: null }),
    }
    const client = { from: vi.fn().mockReturnValue(chain) } as never
    const findings = await validateSkuSubfamilyBelongsToFamily(IDS.sku.frame, client)
    expect(findings).toHaveLength(1)
    expect(findings[0].rule_code).toBe('V-SKU-002')
    expect(findings[0].severity).toBe('error')
    expect(findings[0].message).toContain('WND-FRAME-001')
  })

  it('returns no findings when subfamily belongs to the correct family', async () => {
    const sku = {
      id: IDS.sku.frame,
      part_number: 'WND-FRAME-001',
      family_id: IDS.family.window,
      subfamily_id: IDS.subfamily.pvc,
      subfamilies: { id: IDS.subfamily.pvc, family_id: IDS.family.window },  // correct
    }
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: sku, error: null }),
    }
    const client = { from: vi.fn().mockReturnValue(chain) } as never
    const findings = await validateSkuSubfamilyBelongsToFamily(IDS.sku.frame, client)
    expect(findings).toHaveLength(0)
  })

  it('returns no findings when SKU has no subfamily assigned', async () => {
    const sku = {
      id: IDS.sku.frame,
      part_number: 'WND-FRAME-001',
      family_id: IDS.family.window,
      subfamily_id: null,
      subfamilies: null,
    }
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: sku, error: null }),
    }
    const client = { from: vi.fn().mockReturnValue(chain) } as never
    const findings = await validateSkuSubfamilyBelongsToFamily(IDS.sku.frame, client)
    expect(findings).toHaveLength(0)
  })
})

// ─── V-SKU-004: Active cost must exist for SKU ───────────────────────────────

describe('V-SKU-004: SKU must have an active cost entry', () => {
  beforeEach(() => { vi.clearAllMocks() })

  function makeSkuChain(status: string) {
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: IDS.sku.frame, part_number: 'WND-FRAME-001', status }, error: null }),
    }
  }

  function makeCostItemChain(count: number) {
    // .select().eq('scope_type',...).eq('scope_id',...).or(...).or(...)
    const secondOr = { count, error: null }
    const firstOr = { or: vi.fn().mockResolvedValue(secondOr) }
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnValue(firstOr),
    }
  }

  function makeSupplierPriceChain(count: number) {
    // .select().eq('sku_id',...).lte('effective_from',...).or(...)
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      or: vi.fn().mockResolvedValue({ count, error: null }),
    }
  }

  it('returns warning when SKU has neither cost_item nor supplier_price', async () => {
    const client = {
      from: vi.fn((table: string) => {
        if (table === 'skus') return makeSkuChain('active')
        if (table === 'cost_items') return makeCostItemChain(0)
        if (table === 'supplier_prices') return makeSupplierPriceChain(0)
        return makeSkuChain('active')
      }),
    } as never
    const findings = await validateSkuHasActiveCost(IDS.sku.frame, client)
    expect(findings).toHaveLength(1)
    expect(findings[0].rule_code).toBe('V-SKU-004')
    expect(findings[0].severity).toBe('warning')
    expect(findings[0].message).toContain('WND-FRAME-001')
  })

  it('returns no findings when cost_item exists for the SKU', async () => {
    const client = {
      from: vi.fn((table: string) => {
        if (table === 'skus') return makeSkuChain('active')
        return makeCostItemChain(1)
      }),
    } as never
    const findings = await validateSkuHasActiveCost(IDS.sku.frame, client)
    expect(findings).toHaveLength(0)
  })

  it('returns no findings for archived SKU (validation skipped)', async () => {
    const client = { from: vi.fn().mockReturnValue(makeSkuChain('archived')) } as never
    const findings = await validateSkuHasActiveCost(IDS.sku.frame, client)
    expect(findings).toHaveLength(0)
  })

  it('returns no findings when supplier_price exists (cost_item absent)', async () => {
    const client = {
      from: vi.fn((table: string) => {
        if (table === 'skus') return makeSkuChain('active')
        if (table === 'cost_items') return makeCostItemChain(0)
        if (table === 'supplier_prices') return makeSupplierPriceChain(1)
        return makeSkuChain('active')
      }),
    } as never
    const findings = await validateSkuHasActiveCost(IDS.sku.frame, client)
    expect(findings).toHaveLength(0)
  })
})
