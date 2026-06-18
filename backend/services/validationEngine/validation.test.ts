import { describe, it, expect, vi, beforeEach } from 'vitest'
import { validateBomHasLines } from './rules/bom/V-BOM-001'
import { validateBomLineQuantities } from './rules/bom/V-BOM-004'
import { validateNoDuplicateBomLines } from './rules/bom/V-BOM-003'
import { validateScrapRateRange } from './rules/cost/V-COST-003'
import { validateGlobalOverheadExists } from './rules/cost/V-COST-004'
import { validateActiveRuleHasConditions } from './rules/rule/V-RULE-003'
import { validateNoStaleExceptions } from './rules/rule/V-RULE-004'
import { validateInventoryLinesHaveCosts } from './rules/inventory/V-INV-002'
import { validateSnapshotTotalNotZero } from './rules/inventory/V-INV-003'

// Minimal Supabase client mock factory
function makeClient(overrides: Record<string, unknown> = {}) {
  return overrides
}

// Helper: build a mock select chain that resolves to a given result
function mockSelect(result: { data?: unknown; error?: unknown; count?: number | null }) {
  const terminal = vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null, count: result.count ?? null })
  const chain: Record<string, unknown> = {}
  const chainFns = ['select', 'eq', 'neq', 'in', 'not', 'lte', 'gte', 'lt', 'order', 'limit', 'single', 'maybeSingle', 'or', 'is']
  for (const fn of chainFns) {
    chain[fn] = vi.fn().mockReturnThis()
  }
  // Override terminal calls
  ;(chain['single'] as ReturnType<typeof vi.fn>).mockResolvedValue({ data: result.data ?? null, error: result.error ?? null })
  ;(chain['maybeSingle'] as ReturnType<typeof vi.fn>).mockResolvedValue({ data: result.data ?? null, error: result.error ?? null })
  // The awaited chain (from await client.from(...).select(...).eq(...))
  Object.assign(chain, { then: terminal.mockImplementation((cb: (r: typeof result) => unknown) => Promise.resolve(cb({ data: result.data ?? null, error: result.error ?? null, count: result.count ?? null }))) })
  return chain
}

// ─── V-BOM-001 ───────────────────────────────────────────────────────────────

describe('V-BOM-001: BOM must have at least one line', () => {
  it('returns no findings when BOM has lines', async () => {
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ count: 3, error: null }),
        }),
      }),
    } as never
    const findings = await validateBomHasLines('bv-1', client)
    expect(findings).toHaveLength(0)
  })

  it('returns error finding when BOM has zero lines', async () => {
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
        }),
      }),
    } as never
    const findings = await validateBomHasLines('bv-1', client)
    expect(findings).toHaveLength(1)
    expect(findings[0].rule_code).toBe('V-BOM-001')
    expect(findings[0].severity).toBe('error')
  })
})

// ─── V-BOM-004 ───────────────────────────────────────────────────────────────

describe('V-BOM-004: Quantities must be > 0', () => {
  it('returns no findings when all quantities are valid', async () => {
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            lte: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    } as never
    const findings = await validateBomLineQuantities('bv-1', client)
    expect(findings).toHaveLength(0)
  })

  it('returns one error per zero-quantity line', async () => {
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            lte: vi.fn().mockResolvedValue({
              data: [{ id: 'line-1', quantity: 0 }, { id: 'line-2', quantity: -1 }],
              error: null,
            }),
          }),
        }),
      }),
    } as never
    const findings = await validateBomLineQuantities('bv-1', client)
    expect(findings).toHaveLength(2)
    expect(findings.every(f => f.rule_code === 'V-BOM-004')).toBe(true)
    expect(findings.every(f => f.severity === 'error')).toBe(true)
  })
})

// ─── V-BOM-003 ───────────────────────────────────────────────────────────────

describe('V-BOM-003: Duplicate BOM lines warning', () => {
  it('returns no findings for unique SKUs at same level', async () => {
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            not: vi.fn().mockResolvedValue({
              data: [
                { id: 'L1', sku_id: 'sku-A', parent_line_id: null },
                { id: 'L2', sku_id: 'sku-B', parent_line_id: null },
              ],
              error: null,
            }),
          }),
        }),
      }),
    } as never
    const findings = await validateNoDuplicateBomLines('bv-1', client)
    expect(findings).toHaveLength(0)
  })

  it('returns warning when same SKU appears twice under same parent', async () => {
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            not: vi.fn().mockResolvedValue({
              data: [
                { id: 'L1', sku_id: 'sku-A', parent_line_id: null },
                { id: 'L2', sku_id: 'sku-A', parent_line_id: null }, // duplicate
              ],
              error: null,
            }),
          }),
        }),
      }),
    } as never
    const findings = await validateNoDuplicateBomLines('bv-1', client)
    expect(findings).toHaveLength(1)
    expect(findings[0].rule_code).toBe('V-BOM-003')
    expect(findings[0].severity).toBe('warning')
    expect(findings[0].entity_id).toBe('L2')
  })

  it('allows same SKU under different parents', async () => {
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            not: vi.fn().mockResolvedValue({
              data: [
                { id: 'L1', sku_id: 'sku-shared', parent_line_id: 'parent-A' },
                { id: 'L2', sku_id: 'sku-shared', parent_line_id: 'parent-B' },
              ],
              error: null,
            }),
          }),
        }),
      }),
    } as never
    const findings = await validateNoDuplicateBomLines('bv-1', client)
    expect(findings).toHaveLength(0)
  })
})

// ─── V-COST-003 ──────────────────────────────────────────────────────────────

describe('V-COST-003: Scrap rate range 0-100%', () => {
  it('returns no findings when scrap rates are valid', async () => {
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{ id: 'ci-1', value: 5, scope_type: 'global', scope_id: null }],
              error: null,
            }),
          }),
        }),
      }),
    } as never
    const findings = await validateScrapRateRange('cs-1', client)
    expect(findings).toHaveLength(0)
  })

  it('returns error for scrap rate above 100%', async () => {
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{ id: 'ci-1', value: 150, scope_type: 'global', scope_id: null }],
              error: null,
            }),
          }),
        }),
      }),
    } as never
    const findings = await validateScrapRateRange('cs-1', client)
    expect(findings).toHaveLength(1)
    expect(findings[0].rule_code).toBe('V-COST-003')
    expect(findings[0].severity).toBe('error')
  })

  it('returns error for negative scrap rate', async () => {
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{ id: 'ci-1', value: -5, scope_type: 'global', scope_id: null }],
              error: null,
            }),
          }),
        }),
      }),
    } as never
    const findings = await validateScrapRateRange('cs-1', client)
    expect(findings).toHaveLength(1)
  })

  it('returns 0 at boundary (exact 0% is valid)', async () => {
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{ id: 'ci-1', value: 0 }, { id: 'ci-2', value: 100 }],
              error: null,
            }),
          }),
        }),
      }),
    } as never
    const findings = await validateScrapRateRange('cs-1', client)
    expect(findings).toHaveLength(0)
  })
})

// ─── V-COST-004 ──────────────────────────────────────────────────────────────

describe('V-COST-004: Global overhead must exist', () => {
  it('returns no findings when global overhead exists', async () => {
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ count: 1, error: null }),
            }),
          }),
        }),
      }),
    } as never
    const findings = await validateGlobalOverheadExists('cs-1', client)
    expect(findings).toHaveLength(0)
  })

  it('returns warning when no global overhead entry', async () => {
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
    } as never
    const findings = await validateGlobalOverheadExists('cs-1', client)
    expect(findings).toHaveLength(1)
    expect(findings[0].rule_code).toBe('V-COST-004')
    expect(findings[0].severity).toBe('warning')
  })
})

// ─── V-RULE-003 ──────────────────────────────────────────────────────────────

describe('V-RULE-003: Active rule must have conditions', () => {
  it('returns no findings for inactive rule with no conditions', async () => {
    let callCount = 0
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockImplementation(() => ({
          eq: vi.fn().mockImplementation(() => ({
            single: vi.fn().mockResolvedValue({ data: { id: 'r1', name: 'Test', is_active: false }, error: null }),
            eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
          })),
        })),
      }),
    } as never
    const findings = await validateActiveRuleHasConditions('r1', client)
    expect(findings).toHaveLength(0)
  })
})

// ─── V-RULE-004 ──────────────────────────────────────────────────────────────

describe('V-RULE-004: Stale exceptions', () => {
  it('returns no findings when no stale exceptions', async () => {
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              not: vi.fn().mockReturnValue({
                lt: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        }),
      }),
    } as never
    const findings = await validateNoStaleExceptions('r1', client)
    expect(findings).toHaveLength(0)
  })

  it('returns warning for each stale active exception', async () => {
    const past = '2020-01-01'
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              not: vi.fn().mockReturnValue({
                lt: vi.fn().mockResolvedValue({
                  data: [
                    { id: 'ex1', effective_to: past, exception_scope_type: 'sku', exception_scope_id: 'sku-1' },
                    { id: 'ex2', effective_to: past, exception_scope_type: 'family', exception_scope_id: 'fam-1' },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    } as never
    const findings = await validateNoStaleExceptions('r1', client)
    expect(findings).toHaveLength(2)
    expect(findings.every(f => f.rule_code === 'V-RULE-004')).toBe(true)
    expect(findings.every(f => f.severity === 'warning')).toBe(true)
  })
})

// ─── V-INV-002 ───────────────────────────────────────────────────────────────

describe('V-INV-002: Inventory lines must have costs', () => {
  it('returns no findings when all lines have costs', async () => {
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    } as never
    const findings = await validateInventoryLinesHaveCosts('snap-1', client)
    expect(findings).toHaveLength(0)
  })

  it('returns error for each line missing cost', async () => {
    const mockLines = [
      { id: 'line-1', sku_id: 'sku-A', has_missing_cost: true },
      { id: 'line-2', sku_id: 'sku-B', has_missing_cost: true },
    ]
    let callIdx = 0
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockImplementation(() => ({
          eq: vi.fn().mockImplementation(() => ({
            eq: vi.fn().mockImplementation(() => {
              callIdx++
              if (callIdx === 1) return Promise.resolve({ data: mockLines, error: null })
              // Second call: get SKU part numbers
              return { in: vi.fn().mockResolvedValue({ data: [{ id: 'sku-A', part_number: 'P-001' }, { id: 'sku-B', part_number: 'P-002' }], error: null }) }
            }),
            in: vi.fn().mockResolvedValue({ data: [{ id: 'sku-A', part_number: 'P-001' }, { id: 'sku-B', part_number: 'P-002' }], error: null }),
          })),
        })),
      }),
    } as never

    // Simpler mock that works with the actual chain
    const client2 = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'inventory_lines') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: mockLines, error: null }),
              }),
            }),
          }
        }
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [{ id: 'sku-A', part_number: 'P-001' }, { id: 'sku-B', part_number: 'P-002' }], error: null }),
          }),
        }
      }),
    } as never
    const findings = await validateInventoryLinesHaveCosts('snap-1', client2)
    expect(findings).toHaveLength(2)
    expect(findings.every(f => f.rule_code === 'V-INV-002')).toBe(true)
    expect(findings.every(f => f.severity === 'error')).toBe(true)
    expect(findings[0].message).toContain('P-001')
  })
})

// ─── V-INV-003 ───────────────────────────────────────────────────────────────

describe('V-INV-003: Snapshot total must not be zero when lines exist', () => {
  it('returns no findings for non-zero total', async () => {
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'snap-1', snapshot_name: 'Jan 2026', total_value: 50000, line_count: 100 },
              error: null,
            }),
          }),
        }),
      }),
    } as never
    const findings = await validateSnapshotTotalNotZero('snap-1', client)
    expect(findings).toHaveLength(0)
  })

  it('returns no findings for empty snapshot (zero lines is ok)', async () => {
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'snap-1', snapshot_name: 'Empty', total_value: 0, line_count: 0 },
              error: null,
            }),
          }),
        }),
      }),
    } as never
    const findings = await validateSnapshotTotalNotZero('snap-1', client)
    expect(findings).toHaveLength(0)
  })

  it('returns warning when snapshot has lines but zero total', async () => {
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'snap-1', snapshot_name: 'Missing Costs', total_value: 0, line_count: 50 },
              error: null,
            }),
          }),
        }),
      }),
    } as never
    const findings = await validateSnapshotTotalNotZero('snap-1', client)
    expect(findings).toHaveLength(1)
    expect(findings[0].rule_code).toBe('V-INV-003')
    expect(findings[0].severity).toBe('warning')
    expect(findings[0].message).toContain('50')
  })
})
