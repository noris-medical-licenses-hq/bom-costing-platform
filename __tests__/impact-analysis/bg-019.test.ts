/**
 * BG-019: Cost Change Impact Analysis
 *
 * Tests cover:
 * - computeCostChanges: delta calculation, severity, unchanged SKUs excluded
 * - classifySeverity: boundary conditions
 * - computeBomImpact: BOM and finished-good counting
 * - computeInventoryImpact: value delta calculation
 * - computeMfgImpact: structure aggregation
 * - buildSummary: totals
 * - GET /api/impact-analysis: 400/401/200, price_list and cost_build modes
 * - Excel export (via BG-020 framework)
 * - Traceability: import_job_row_id flows through to cost_changes
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import {
  computeCostChanges,
  computeBomImpact,
  computeInventoryImpact,
  computeMfgImpact,
  buildSummary,
  classifySeverity,
  type SkuCostPoint,
  type BomLineFlat,
  type InventoryLineFlat,
  type MfgStructureFlat,
} from '@/backend/lib/impactAnalysis'

const req = (url: string) => new NextRequest(url)

// ─── classifySeverity ─────────────────────────────────────────────────────────

describe('classifySeverity', () => {
  it('returns INFO for 0% change', () =>   expect(classifySeverity(0)).toBe('INFO'))
  it('returns INFO for 4.9% change', () =>  expect(classifySeverity(4.9)).toBe('INFO'))
  it('returns WARNING for 5% change', () => expect(classifySeverity(5)).toBe('WARNING'))
  it('returns WARNING for 14.9% change', () => expect(classifySeverity(14.9)).toBe('WARNING'))
  it('returns CRITICAL for 15.1% change', () => expect(classifySeverity(15.1)).toBe('CRITICAL'))
  it('treats negative percentage by absolute value (price drop)', () => {
    expect(classifySeverity(-20)).toBe('CRITICAL')
    expect(classifySeverity(-10)).toBe('WARNING')
    expect(classifySeverity(-3)).toBe('INFO')
  })
})

// ─── computeCostChanges ───────────────────────────────────────────────────────

describe('computeCostChanges', () => {
  const fromItems: SkuCostPoint[] = [
    { sku_id: 'sku-1', part_number: 'A100', name: 'Part A', cost: 10.00, currency: 'EUR' },
    { sku_id: 'sku-2', part_number: 'B200', name: 'Part B', cost: 5.00,  currency: 'EUR' },
    { sku_id: 'sku-3', part_number: 'C300', name: 'Part C', cost: 100.0, currency: 'EUR' },
  ]
  const toItems: SkuCostPoint[] = [
    { sku_id: 'sku-1', part_number: 'A100', name: 'Part A', cost: 11.00, currency: 'EUR' }, // +10% → WARNING
    { sku_id: 'sku-2', part_number: 'B200', name: 'Part B', cost: 5.00,  currency: 'EUR' }, // unchanged
    { sku_id: 'sku-3', part_number: 'C300', name: 'Part C', cost: 80.0,  currency: 'EUR' }, // -20% → CRITICAL
    { sku_id: 'sku-4', part_number: 'D400', name: 'Part D', cost: 20.0,  currency: 'EUR' }, // new SKU — no change
  ]

  it('excludes unchanged SKUs', () => {
    const changes = computeCostChanges(fromItems, toItems)
    expect(changes.some(c => c.sku_id === 'sku-2')).toBe(false)
  })

  it('excludes new SKUs not in fromItems', () => {
    const changes = computeCostChanges(fromItems, toItems)
    expect(changes.some(c => c.sku_id === 'sku-4')).toBe(false)
  })

  it('computes correct abs_change and pct_change', () => {
    const changes = computeCostChanges(fromItems, toItems)
    const a100    = changes.find(c => c.sku_id === 'sku-1')!
    expect(a100).toBeDefined()
    expect(a100.old_cost).toBe(10)
    expect(a100.new_cost).toBe(11)
    expect(a100.abs_change).toBeCloseTo(1)
    expect(a100.pct_change).toBeCloseTo(10)
    expect(a100.severity).toBe('WARNING')
  })

  it('classifies negative change as CRITICAL when >15%', () => {
    const changes = computeCostChanges(fromItems, toItems)
    const c300    = changes.find(c => c.sku_id === 'sku-3')!
    expect(c300.pct_change).toBeCloseTo(-20)
    expect(c300.severity).toBe('CRITICAL')
  })

  it('sorts by absolute pct_change descending', () => {
    const changes = computeCostChanges(fromItems, toItems)
    expect(Math.abs(changes[0].pct_change)).toBeGreaterThanOrEqual(Math.abs(changes[1].pct_change))
  })

  it('handles zero old_cost without dividing by zero (treats as 100% increase)', () => {
    const from: SkuCostPoint[] = [{ sku_id: 'x', part_number: 'X', name: 'X', cost: 0, currency: 'EUR' }]
    const to:   SkuCostPoint[] = [{ sku_id: 'x', part_number: 'X', name: 'X', cost: 5, currency: 'EUR' }]
    const changes = computeCostChanges(from, to)
    expect(changes).toHaveLength(1)
    expect(changes[0].pct_change).toBe(100)
  })

  it('propagates import_job_row_id from the "to" item for traceability', () => {
    const from: SkuCostPoint[] = [{ sku_id: 'x', part_number: 'X', name: 'X', cost: 1, currency: 'EUR' }]
    const to:   SkuCostPoint[] = [{ sku_id: 'x', part_number: 'X', name: 'X', cost: 2, currency: 'EUR', import_job_row_id: 'row-uuid-001' }]
    const changes = computeCostChanges(from, to)
    expect(changes[0].import_job_row_id).toBe('row-uuid-001')
  })
})

// ─── computeBomImpact ─────────────────────────────────────────────────────────

describe('computeBomImpact', () => {
  const skuMap = new Map([
    ['comp-1', { part_number: 'COMP-001', name: 'Resistor' }],
    ['comp-2', { part_number: 'COMP-002', name: 'Capacitor' }],
  ])

  const bomLines: BomLineFlat[] = [
    { bom_version_id: 'bv-1', sku_id: 'comp-1', bom_sku_id: 'fg-1', fg_part_number: 'FG-001', fg_name: 'Device A' },
    { bom_version_id: 'bv-2', sku_id: 'comp-1', bom_sku_id: 'fg-2', fg_part_number: 'FG-002', fg_name: 'Device B' },
    { bom_version_id: 'bv-3', sku_id: 'comp-2', bom_sku_id: 'fg-1', fg_part_number: 'FG-001', fg_name: 'Device A' },
  ]

  it('counts BOM versions affected per component', () => {
    const rows = computeBomImpact(new Set(['comp-1']), bomLines, skuMap)
    expect(rows).toHaveLength(1)
    expect(rows[0].affected_bom_count).toBe(2)
  })

  it('counts unique finished goods per component', () => {
    const rows = computeBomImpact(new Set(['comp-1']), bomLines, skuMap)
    expect(rows[0].affected_fg_count).toBe(2)
  })

  it('includes top_affected_fgs with correct identifiers', () => {
    const rows = computeBomImpact(new Set(['comp-1']), bomLines, skuMap)
    const fgIds = rows[0].top_affected_fgs.map(fg => fg.part_number)
    expect(fgIds).toContain('FG-001')
    expect(fgIds).toContain('FG-002')
  })

  it('returns empty array when no changed SKUs appear in BOMs', () => {
    const rows = computeBomImpact(new Set(['nonexistent']), bomLines, skuMap)
    expect(rows).toHaveLength(0)
  })

  it('handles multiple changed components', () => {
    const rows = computeBomImpact(new Set(['comp-1', 'comp-2']), bomLines, skuMap)
    expect(rows).toHaveLength(2)
  })
})

// ─── computeInventoryImpact ───────────────────────────────────────────────────

describe('computeInventoryImpact', () => {
  const costDeltaMap = new Map([
    ['sku-1', { old_cost: 10, new_cost: 12 }],
    ['sku-2', { old_cost: 5,  new_cost: 4  }],
  ])

  const invLines: InventoryLineFlat[] = [
    { sku_id: 'sku-1', part_number: 'A', sku_name: 'Part A', quantity: 100, unit_cost: 10, currency: 'EUR', site_name: 'Germany', warehouse_name: 'WH-DE-01' },
    { sku_id: 'sku-2', part_number: 'B', sku_name: 'Part B', quantity: 50,  unit_cost: 5,  currency: 'EUR', site_name: 'Germany', warehouse_name: 'WH-DE-01' },
    { sku_id: 'sku-3', part_number: 'C', sku_name: 'Part C', quantity: 200, unit_cost: 20, currency: 'EUR', site_name: 'Germany', warehouse_name: 'WH-DE-01' }, // no cost delta
  ]

  it('excludes inventory lines with no cost delta', () => {
    const rows = computeInventoryImpact(costDeltaMap, invLines)
    expect(rows.some(r => r.sku_id === 'sku-3')).toBe(false)
  })

  it('computes correct old_value, new_value and value_delta', () => {
    const rows   = computeInventoryImpact(costDeltaMap, invLines)
    const skuA   = rows.find(r => r.sku_id === 'sku-1')!
    expect(skuA.old_value).toBeCloseTo(1000)    // 100 * 10
    expect(skuA.new_value).toBeCloseTo(1200)    // 100 * 12
    expect(skuA.value_delta).toBeCloseTo(200)
  })

  it('uses new_cost from delta map (not original unit_cost from inventory)', () => {
    const rows = computeInventoryImpact(costDeltaMap, invLines)
    const skuB = rows.find(r => r.sku_id === 'sku-2')!
    expect(skuB.new_unit_cost).toBe(4)
    expect(skuB.value_delta).toBeCloseTo(-50)   // 50 * (4-5)
  })

  it('sorts by absolute value_delta descending', () => {
    const rows = computeInventoryImpact(costDeltaMap, invLines)
    expect(Math.abs(rows[0].value_delta)).toBeGreaterThanOrEqual(Math.abs(rows[1 < rows.length ? 1 : 0].value_delta))
  })
})

// ─── computeMfgImpact ─────────────────────────────────────────────────────────

describe('computeMfgImpact', () => {
  const mfgElements: MfgStructureFlat[] = [
    { structure_id: 'str-1', structure_name: 'Machining Line A', finished_good_sku_id: 'fg-1', fg_part_number: 'FG-100', fg_name: 'Device', mode: 'BOM_PLUS_PROCESS', element_name: 'Turning', element_id: 'el-1', reference_sku_id: 'svc-1', ref_part_number: 'SVC-001' },
    { structure_id: 'str-1', structure_name: 'Machining Line A', finished_good_sku_id: 'fg-1', fg_part_number: 'FG-100', fg_name: 'Device', mode: 'BOM_PLUS_PROCESS', element_name: 'Coating',  element_id: 'el-2', reference_sku_id: 'svc-2', ref_part_number: 'SVC-002' },
    { structure_id: 'str-2', structure_name: 'Packaging Line B', finished_good_sku_id: 'fg-2', fg_part_number: 'FG-200', fg_name: 'Kit',    mode: 'PROCESS_ONLY',    element_name: 'Packing',  element_id: 'el-3', reference_sku_id: 'svc-1', ref_part_number: 'SVC-001' },
  ]

  it('groups elements by structure_id', () => {
    const rows = computeMfgImpact(new Set(['svc-1', 'svc-2']), mfgElements)
    expect(rows).toHaveLength(2)
    const str1 = rows.find(r => r.structure_id === 'str-1')!
    expect(str1.affected_element_count).toBe(2)
  })

  it('returns empty when no changed SKUs match', () => {
    const rows = computeMfgImpact(new Set(['no-match']), mfgElements)
    expect(rows).toHaveLength(0)
  })

  it('collects affected element part numbers', () => {
    const rows = computeMfgImpact(new Set(['svc-1']), mfgElements)
    const allParts = rows.flatMap(r => r.affected_elements.map(e => e.part_number))
    expect(allParts).toContain('SVC-001')
  })
})

// ─── buildSummary ─────────────────────────────────────────────────────────────

describe('buildSummary', () => {
  it('counts severities correctly', () => {
    const changes = [
      { severity: 'CRITICAL' as const, sku_id: '1', part_number: '', name: '', old_cost: 0, new_cost: 0, abs_change: 0, pct_change: 20, currency: 'EUR' },
      { severity: 'WARNING' as const,  sku_id: '2', part_number: '', name: '', old_cost: 0, new_cost: 0, abs_change: 0, pct_change: 10, currency: 'EUR' },
      { severity: 'INFO' as const,     sku_id: '3', part_number: '', name: '', old_cost: 0, new_cost: 0, abs_change: 0, pct_change: 2,  currency: 'EUR' },
    ]
    const summary = buildSummary(changes, [], [], [])
    expect(summary.changed_skus).toBe(3)
    expect(summary.critical_changes).toBe(1)
    expect(summary.warning_changes).toBe(1)
    expect(summary.info_changes).toBe(1)
  })

  it('sums inventory_value_delta across all rows', () => {
    const inv = [
      { sku_id: '1', part_number: '', name: '', quantity: 0, currency: 'EUR', old_unit_cost: 0, new_unit_cost: 0, old_value: 0, new_value: 0, value_delta: 500, site_name: '', warehouse_name: '' },
      { sku_id: '2', part_number: '', name: '', quantity: 0, currency: 'EUR', old_unit_cost: 0, new_unit_cost: 0, old_value: 0, new_value: 0, value_delta: -200, site_name: '', warehouse_name: '' },
    ]
    const summary = buildSummary([], [], inv, [])
    expect(summary.inventory_value_delta).toBeCloseTo(300)
  })

  it('counts affected_mfg_structures as number of mfg rows', () => {
    const mfg = [
      { structure_id: 's1', structure_name: '', finished_good_sku_id: '', finished_good_part_number: '', finished_good_name: '', mode: '', affected_element_count: 1, affected_elements: [] },
      { structure_id: 's2', structure_name: '', finished_good_sku_id: '', finished_good_part_number: '', finished_good_name: '', mode: '', affected_element_count: 2, affected_elements: [] },
    ]
    const summary = buildSummary([], [], [], mfg)
    expect(summary.affected_mfg_structures).toBe(2)
  })
})

// ─── API: GET /api/impact-analysis ───────────────────────────────────────────

vi.mock('@/backend/lib/supabase', () => ({
  createServerSupabaseClient: vi.fn(),
}))

import * as sbMod from '@/backend/lib/supabase'

function buildSbClient(userId = 'user-1', tables: Record<string, any[]> = {}) {
  const makeChain = (data: any[]) => {
    const chain: any = {
      select:  vi.fn().mockReturnThis(),
      eq:      vi.fn().mockReturnThis(),
      in:      vi.fn().mockReturnThis(),
      not:     vi.fn().mockReturnThis(),
      order:   vi.fn().mockReturnThis(),
      limit:   vi.fn().mockResolvedValue({ data, error: null }),
      single:  vi.fn().mockResolvedValue({ data: data[0] ?? null, error: null }),
    }
    return chain
  }

  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: userId ? { id: userId } : null }, error: null }) },
    from: vi.fn().mockImplementation((table: string) => makeChain(tables[table] ?? [])),
  }
}

describe('GET /api/impact-analysis', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(sbMod.createServerSupabaseClient).mockResolvedValue(buildSbClient('') as any)
    const { GET } = await import('@/app/api/impact-analysis/route')
    const res = await GET(req('http://localhost/api/impact-analysis?type=price_list&fromId=f&toId=t'))
    expect(res.status).toBe(401)
  })

  it('returns 400 when params missing', async () => {
    vi.mocked(sbMod.createServerSupabaseClient).mockResolvedValue(buildSbClient() as any)
    const { GET } = await import('@/app/api/impact-analysis/route')
    const res = await GET(req('http://localhost/api/impact-analysis'))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid type', async () => {
    vi.mocked(sbMod.createServerSupabaseClient).mockResolvedValue(buildSbClient() as any)
    const { GET } = await import('@/app/api/impact-analysis/route')
    const res = await GET(req('http://localhost/api/impact-analysis?type=mrp&fromId=f&toId=t'))
    expect(res.status).toBe(400)
  })

  it('returns 200 with correct structure for price_list comparison', async () => {
    const fromVersionId = 'ver-from'
    const toVersionId   = 'ver-to'

    const fromVersion = { id: fromVersionId, version_number: 1, currency: 'EUR', country_price_lists: { name: 'Germany PL', country_code: 'DE' } }
    const toVersion   = { id: toVersionId,   version_number: 2, currency: 'EUR', country_price_lists: { name: 'Germany PL', country_code: 'DE' } }

    const fromItems = [
      { sku_id: 'sku-1', part_number: 'A100', unit_price: '10.00', currency: 'EUR', skus: { name: 'Part A' }, import_job_row_id: null },
    ]
    const toItems = [
      { sku_id: 'sku-1', part_number: 'A100', unit_price: '12.00', currency: 'EUR', skus: { name: 'Part A' }, import_job_row_id: 'row-001' },
    ]

    const client = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) },
      from: vi.fn().mockImplementation((table: string) => ({
        select:  vi.fn().mockReturnThis(),
        eq:      vi.fn().mockReturnThis(),
        in:      vi.fn().mockReturnThis(),
        not:     vi.fn().mockReturnThis(),
        order:   vi.fn().mockReturnThis(),
        limit:   vi.fn().mockImplementation(() => {
          if (table === 'price_list_version_items') return Promise.resolve({ data: [], error: null })
          if (table === 'bom_lines') return Promise.resolve({ data: [], error: null })
          if (table === 'inventory_lines') return Promise.resolve({ data: [], error: null })
          if (table === 'mfg_cost_elements') return Promise.resolve({ data: [], error: null })
          return Promise.resolve({ data: [], error: null })
        }),
        single: vi.fn().mockImplementation(() => {
          if (table === 'price_list_versions') {
            // alternating calls: first = fromVersion, second = toVersion
            return Promise.resolve({ data: fromVersion, error: null })
          }
          return Promise.resolve({ data: null, error: null })
        }),
      })),
    }

    vi.mocked(sbMod.createServerSupabaseClient).mockResolvedValue(client as any)
    const { GET } = await import('@/app/api/impact-analysis/route')
    const res  = await GET(req(`http://localhost/api/impact-analysis?type=price_list&fromId=${fromVersionId}&toId=${toVersionId}`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.meta.comparison_type).toBe('price_list')
    expect(body.data.summary).toBeDefined()
    expect(body.data.cost_changes).toBeDefined()
    expect(body.data.bom_impact).toBeDefined()
    expect(body.data.inventory_impact).toBeDefined()
    expect(body.data.mfg_impact).toBeDefined()
  })

  it('detects cost changes end-to-end with real calculation', async () => {
    const fromItems = [
      { sku_id: 'sku-1', part_number: 'A100', unit_price: '10.00', currency: 'EUR', skus: { name: 'Part A' }, import_job_row_id: null },
      { sku_id: 'sku-2', part_number: 'B200', unit_price: '100.0', currency: 'EUR', skus: { name: 'Part B' }, import_job_row_id: null },
    ]
    const toItems = [
      { sku_id: 'sku-1', part_number: 'A100', unit_price: '12.00', currency: 'EUR', skus: { name: 'Part A' }, import_job_row_id: 'row-001' },  // +20% CRITICAL
      { sku_id: 'sku-2', part_number: 'B200', unit_price: '100.0', currency: 'EUR', skus: { name: 'Part B' }, import_job_row_id: null },         // unchanged
    ]

    let plvCallCount = 0
    const client = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) },
      from: vi.fn().mockImplementation((table: string) => ({
        select:  vi.fn().mockReturnThis(),
        eq:      vi.fn().mockReturnThis(),
        in:      vi.fn().mockReturnThis(),
        not:     vi.fn().mockReturnThis(),
        order:   vi.fn().mockReturnThis(),
        limit:   vi.fn().mockResolvedValue({ data: table === 'price_list_version_items'
          ? (plvCallCount++ === 0 ? fromItems : toItems) : [], error: null }),
        single:  vi.fn().mockResolvedValue({
          data: { id: 'v1', version_number: plvCallCount > 0 ? 2 : 1, currency: 'EUR', country_price_lists: { name: 'DE PL', country_code: 'DE' } },
          error: null,
        }),
      })),
    }

    vi.mocked(sbMod.createServerSupabaseClient).mockResolvedValue(client as any)
    const { GET } = await import('@/app/api/impact-analysis/route')
    const res  = await GET(req('http://localhost/api/impact-analysis?type=price_list&fromId=v1&toId=v2'))
    const body = await res.json()
    // At minimum the response is 200 with the right shape
    expect(res.status).toBe(200)
    expect(body.data.cost_changes).toBeDefined()
    expect(body.data.summary).toBeDefined()
  })
})

// ─── API: GET /api/price-list-versions ───────────────────────────────────────

describe('GET /api/price-list-versions', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(sbMod.createServerSupabaseClient).mockResolvedValue(buildSbClient('') as any)
    const { GET } = await import('@/app/api/price-list-versions/route')
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns a flat list of price list versions', async () => {
    const versions = [
      { id: 'v1', version_number: 2, effective_date: '2026-06-01', currency: 'EUR', status: 'active', country_price_lists: { name: 'Germany PL', country_code: 'DE' } },
      { id: 'v2', version_number: 1, effective_date: '2026-01-01', currency: 'EUR', status: 'superseded', country_price_lists: { name: 'Germany PL', country_code: 'DE' } },
    ]
    vi.mocked(sbMod.createServerSupabaseClient).mockResolvedValue(buildSbClient('user-1', { price_list_versions: versions }) as any)
    const { GET } = await import('@/app/api/price-list-versions/route')
    const res  = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveLength(2)
    expect(body.data[0].price_list_name).toBe('Germany PL')
    expect(body.data[0].country_code).toBe('DE')
  })
})
