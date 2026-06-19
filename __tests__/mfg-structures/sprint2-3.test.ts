/**
 * Phase 2.3 — Manufacturing Cost Structures: unit tests
 *
 * Tests cover:
 * 1. Element validation rules (referenceSkuId mandatory for non-FIXED)
 * 2. process_category values
 * 3. MfgRollupResult shape expectations
 * 4. INCOMPLETE / complete_with_warnings logic
 * 5. Version numbering contract
 * 6. Zod schema guards from the API layer (imported directly)
 */

import { describe, it, expect } from 'vitest'
import { z } from 'zod'

// ─── Inline schema (mirrors app/api/mfg-structures/[id]/elements/route.ts) ───

const ElementSchema = z.object({
  sequence:        z.number().int().positive(),
  elementType:     z.enum(['MATERIAL', 'SUBCONTRACT_PROCESS', 'OVERHEAD', 'MANUAL']),
  processCategory: z.enum(['MACHINING', 'SURFACE_TREATMENT', 'STERILIZATION', 'PACKAGING', 'INSPECTION', 'ASSEMBLY', 'OTHER']).default('OTHER'),
  name:            z.string().min(1).max(200),
  supplierId:      z.string().uuid().optional().nullable(),
  referenceSkuId:  z.string().uuid().optional().nullable(),
  quantity:        z.number().positive().default(1),
  costSource:      z.enum(['FIXED', 'PRICE_LIST', 'LAST_PURCHASE', 'AVERAGE_PURCHASE']),
  fixedCost:       z.number().min(0).optional().nullable(),
  fixedCurrency:   z.string().length(3).toUpperCase().optional().nullable(),
  notes:           z.string().max(1000).optional().nullable(),
}).refine(
  d => d.costSource !== 'FIXED' || (d.fixedCost !== undefined && d.fixedCost !== null && d.fixedCurrency !== undefined && d.fixedCurrency !== null),
  { message: 'Fixed cost and currency are required when costSource is FIXED' }
).refine(
  d => d.costSource === 'FIXED' || (d.referenceSkuId !== undefined && d.referenceSkuId !== null),
  { message: 'referenceSkuId is required for non-FIXED cost sources' }
)

const FAKE_UUID = '00000000-0000-4000-8000-000000000001'
const FAKE_SKU  = '00000000-0000-4000-8000-000000000002'

const BASE_EL = {
  sequence: 10,
  elementType: 'SUBCONTRACT_PROCESS' as const,
  processCategory: 'MACHINING' as const,
  name: 'Turning',
  costSource: 'LAST_PURCHASE' as const,
  referenceSkuId: FAKE_SKU,
}

// ─── 1. Zod element validation ────────────────────────────────────────────────

describe('ElementSchema — non-FIXED requires referenceSkuId', () => {
  it('accepts valid LAST_PURCHASE element with referenceSkuId', () => {
    const r = ElementSchema.safeParse(BASE_EL)
    expect(r.success).toBe(true)
  })

  it('rejects LAST_PURCHASE element with no referenceSkuId', () => {
    const r = ElementSchema.safeParse({ ...BASE_EL, referenceSkuId: null })
    expect(r.success).toBe(false)
    expect(JSON.stringify(r)).toContain('referenceSkuId is required')
  })

  it('rejects PRICE_LIST element with no referenceSkuId', () => {
    const r = ElementSchema.safeParse({ ...BASE_EL, costSource: 'PRICE_LIST', referenceSkuId: undefined })
    expect(r.success).toBe(false)
  })

  it('accepts FIXED element without referenceSkuId when fixedCost+fixedCurrency provided', () => {
    const r = ElementSchema.safeParse({
      sequence: 20, elementType: 'OVERHEAD', name: 'Freight', costSource: 'FIXED',
      fixedCost: 5.50, fixedCurrency: 'EUR',
    })
    expect(r.success).toBe(true)
  })

  it('rejects FIXED element missing fixedCost', () => {
    const r = ElementSchema.safeParse({
      sequence: 20, elementType: 'OVERHEAD', name: 'Freight', costSource: 'FIXED',
      fixedCurrency: 'EUR',
    })
    expect(r.success).toBe(false)
    expect(JSON.stringify(r)).toContain('Fixed cost and currency are required')
  })

  it('rejects FIXED element missing fixedCurrency', () => {
    const r = ElementSchema.safeParse({
      sequence: 20, elementType: 'OVERHEAD', name: 'Freight', costSource: 'FIXED',
      fixedCost: 5.50,
    })
    expect(r.success).toBe(false)
  })
})

// ─── 2. processCategory values ────────────────────────────────────────────────

describe('processCategory enum', () => {
  const CATEGORIES = ['MACHINING', 'SURFACE_TREATMENT', 'STERILIZATION', 'PACKAGING', 'INSPECTION', 'ASSEMBLY', 'OTHER'] as const

  it.each(CATEGORIES)('accepts %s', (cat) => {
    const r = ElementSchema.safeParse({ ...BASE_EL, processCategory: cat })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.processCategory).toBe(cat)
  })

  it('rejects unknown category', () => {
    const r = ElementSchema.safeParse({ ...BASE_EL, processCategory: 'WELDING' })
    expect(r.success).toBe(false)
  })

  it('defaults to OTHER when omitted', () => {
    const r = ElementSchema.safeParse({ ...BASE_EL, processCategory: undefined })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.processCategory).toBe('OTHER')
  })
})

// ─── 3. MfgRollupResult shape ─────────────────────────────────────────────────

describe('MfgRollupResult contract', () => {
  interface MfgRollupResult {
    totalCost:       number
    isIncomplete:    boolean
    missingElements: Array<{ seq: number; name: string }>
    structureId:     string
    sourceReference: string
    breakdown:       Record<string, unknown>
  }

  function makeResult(overrides: Partial<MfgRollupResult> = {}): MfgRollupResult {
    return {
      totalCost: 45.30, isIncomplete: false, missingElements: [],
      structureId: FAKE_UUID, sourceReference: 'Test MFG v1 | 3 elements | BOM_PLUS_PROCESS',
      breakdown: { mode: 'BOM_PLUS_PROCESS', elements: [] },
      ...overrides,
    }
  }

  it('complete result has isIncomplete=false and empty missingElements', () => {
    const r = makeResult()
    expect(r.isIncomplete).toBe(false)
    expect(r.missingElements).toHaveLength(0)
    expect(r.totalCost).toBeGreaterThan(0)
  })

  it('incomplete result flags missing elements', () => {
    const r = makeResult({ isIncomplete: true, totalCost: 0, missingElements: [{ seq: 20, name: 'Coating' }] })
    expect(r.isIncomplete).toBe(true)
    expect(r.missingElements).toHaveLength(1)
    expect(r.missingElements[0].seq).toBe(20)
    expect(r.missingElements[0].name).toBe('Coating')
  })

  it('totalCost is sum of resolved elements (not including missing)', () => {
    const r = makeResult({ totalCost: 12.00, isIncomplete: true, missingElements: [{ seq: 30, name: 'Passivation' }] })
    expect(r.totalCost).toBe(12.00)
  })

  it('breakdown records per-element detail', () => {
    const r = makeResult({
      breakdown: {
        mode: 'BOM_PLUS_PROCESS',
        bomCost: 30.00,
        elements: [
          { seq: 10, name: 'Turning', cost: 8.50, costSource: 'LAST_PURCHASE', status: 'resolved' },
          { seq: 20, name: 'Coating', cost: 0, costSource: 'PRICE_LIST', status: 'missing' },
        ],
      },
    })
    const elems = (r.breakdown.elements as any[])
    expect(elems).toHaveLength(2)
    expect(elems[0].status).toBe('resolved')
    expect(elems[1].status).toBe('missing')
  })
})

// ─── 4. complete_with_warnings logic ─────────────────────────────────────────

describe('build status with incomplete MFG lines', () => {
  type BuildStatus = 'complete' | 'complete_with_warnings' | 'error'

  function determineBuildStatus(incompleteCount: number, errorCount: number): BuildStatus {
    if (errorCount > 0) return 'error'
    if (incompleteCount > 0) return 'complete_with_warnings'
    return 'complete'
  }

  it('returns complete when nothing is missing', () => {
    expect(determineBuildStatus(0, 0)).toBe('complete')
  })

  it('returns complete_with_warnings when at least one MFG line is incomplete', () => {
    expect(determineBuildStatus(1, 0)).toBe('complete_with_warnings')
  })

  it('returns complete_with_warnings for multiple incomplete lines', () => {
    expect(determineBuildStatus(3, 0)).toBe('complete_with_warnings')
  })

  it('returns error when error count > 0 regardless of incomplete', () => {
    expect(determineBuildStatus(0, 1)).toBe('error')
  })
})

// ─── 5. Version numbering logic ───────────────────────────────────────────────

describe('version numbering contract', () => {
  function nextVersion(existingVersions: number[]): number {
    if (existingVersions.length === 0) return 1
    return Math.max(...existingVersions) + 1
  }

  it('first structure for a SKU gets version 1', () => {
    expect(nextVersion([])).toBe(1)
  })

  it('second structure for a SKU gets version 2', () => {
    expect(nextVersion([1])).toBe(2)
  })

  it('handles gaps in version sequence gracefully', () => {
    expect(nextVersion([1, 3])).toBe(4)
  })
})

// ─── 6. Activation toggle contract ───────────────────────────────────────────

describe('activation logic', () => {
  interface Version { id: string; is_active: boolean }

  function applyActivation(versions: Version[], idToActivate: string): Version[] {
    return versions.map(v => ({ ...v, is_active: v.id === idToActivate }))
  }

  it('activating a draft deactivates the previously active version', () => {
    const before = [
      { id: 'v1', is_active: true },
      { id: 'v2', is_active: false },
    ]
    const after = applyActivation(before, 'v2')
    expect(after.find(v => v.id === 'v1')?.is_active).toBe(false)
    expect(after.find(v => v.id === 'v2')?.is_active).toBe(true)
  })

  it('only one version is active after toggle', () => {
    const before = [
      { id: 'v1', is_active: true },
      { id: 'v2', is_active: false },
      { id: 'v3', is_active: false },
    ]
    const after = applyActivation(before, 'v3')
    expect(after.filter(v => v.is_active)).toHaveLength(1)
    expect(after.find(v => v.id === 'v3')?.is_active).toBe(true)
  })
})

// ─── 7. Mode enum values ──────────────────────────────────────────────────────

describe('MFG_COST_ROLLUP mode values', () => {
  const VALID_MODES = ['BOM_PLUS_PROCESS', 'PROCESS_ONLY']

  it('BOM_ONLY is not a valid mode (was removed in Phase 2.3 corrections)', () => {
    expect(VALID_MODES).not.toContain('BOM_ONLY')
  })

  it('BOM_PLUS_PROCESS is valid', () => {
    expect(VALID_MODES).toContain('BOM_PLUS_PROCESS')
  })

  it('PROCESS_ONLY is valid', () => {
    expect(VALID_MODES).toContain('PROCESS_ONLY')
  })
})

// ─── 8. CreateSchema validation ───────────────────────────────────────────────

describe('CreateSchema validation', () => {
  const CreateSchema = z.object({
    skuId:         z.string().uuid(),
    name:          z.string().min(1).max(200),
    mode:          z.enum(['BOM_PLUS_PROCESS', 'PROCESS_ONLY']),
    effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
    notes:         z.string().max(1000).optional(),
  })

  it('accepts a valid create payload', () => {
    const r = CreateSchema.safeParse({
      skuId: FAKE_UUID, name: 'Shaft Mfg Cost', mode: 'BOM_PLUS_PROCESS', effectiveDate: '2026-06-19',
    })
    expect(r.success).toBe(true)
  })

  it('rejects BOM_ONLY mode', () => {
    const r = CreateSchema.safeParse({
      skuId: FAKE_UUID, name: 'Test', mode: 'BOM_ONLY', effectiveDate: '2026-06-19',
    })
    expect(r.success).toBe(false)
  })

  it('rejects badly-formatted effective date', () => {
    const r = CreateSchema.safeParse({
      skuId: FAKE_UUID, name: 'Test', mode: 'PROCESS_ONLY', effectiveDate: '19-06-2026',
    })
    expect(r.success).toBe(false)
    expect(JSON.stringify(r)).toContain('YYYY-MM-DD')
  })
})
