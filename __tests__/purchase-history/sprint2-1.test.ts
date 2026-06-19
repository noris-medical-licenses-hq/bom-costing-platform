import { describe, it, expect, vi, beforeEach } from 'vitest'
import { STRATEGY_REGISTRY } from '@/backend/services/costBuild/strategies'
import type { BuildStrategyContext } from '@/backend/services/costBuild/strategies'

const lastPurchaseStrategy    = STRATEGY_REGISTRY['LAST_PURCHASE']
const averagePurchaseStrategy = STRATEGY_REGISTRY['AVERAGE_PURCHASE']

// ── Shared context factory ─────────────────────────────────────────────────────

function makeCtx(overrides?: Partial<BuildStrategyContext>): BuildStrategyContext {
  return {
    orgId:                       'org-1',
    siteId:                      'site-1',
    costSetId:                   'cs-1',
    db:                          {} as any,
    valuationDate:               '2026-06-19',
    priceListVersionId:          null,
    buildCurrency:               'EUR',
    averagePurchaseLookbackDays: 365,
    ...overrides,
  }
}

// ── LAST_PURCHASE ─────────────────────────────────────────────────────────────

describe('lastPurchaseStrategy', () => {
  let ctx: BuildStrategyContext

  beforeEach(() => {
    ctx = makeCtx()
  })

  it('returns null when no purchase history exists', async () => {
    ctx.db = {
      from: () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    }
    const result = await lastPurchaseStrategy('sku-1', ctx)
    expect(result).toBeNull()
  })

  it('returns the most recent purchase record', async () => {
    ctx.db = {
      from: () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: 'ph-1',
            unit_cost: 12.45,
            currency: 'EUR',
            purchase_date: '2026-06-12',
            source_reference: 'SAP PO-2024-001',
            source_system: 'SAP',
            suppliers: { name: 'REHAU', code: 'REH001' },
          },
          error: null,
        }),
      }),
    }
    const result = await lastPurchaseStrategy('sku-1', ctx)
    expect(result).not.toBeNull()
    expect(result!.resolvedCost).toBe(12.45)
    expect(result!.currency).toBe('EUR')
    expect(result!.sourceRecordType).toBe('purchase_history')
    expect(result!.sourceRecordId).toBe('ph-1')
    expect(result!.sourceReference).toContain('SAP PO-2024-001')
    expect(result!.sourceReference).toContain('REHAU')
    expect(result!.sourceReference).toContain('2026-06-12')
    expect(result!.sourceReference).toContain('12.45 EUR')
  })

  it('builds sourceReference without supplier when supplier is null', async () => {
    ctx.db = {
      from: () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: 'ph-2',
            unit_cost: 8.0,
            currency: 'EUR',
            purchase_date: '2026-05-01',
            source_reference: 'ERP-REF-999',
            source_system: null,
            suppliers: null,
          },
          error: null,
        }),
      }),
    }
    const result = await lastPurchaseStrategy('sku-2', ctx)
    expect(result).not.toBeNull()
    expect(result!.sourceReference).toContain('ERP-REF-999')
    expect(result!.sourceReference).not.toContain('null')
    expect(result!.sourceReference).not.toContain('undefined')
  })
})

// ── AVERAGE_PURCHASE ──────────────────────────────────────────────────────────

describe('averagePurchaseStrategy', () => {
  let ctx: BuildStrategyContext

  beforeEach(() => {
    ctx = makeCtx({ buildCurrency: 'EUR', averagePurchaseLookbackDays: 365 })
  })

  it('returns null when no records exist', async () => {
    ctx.db = {
      from: () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        gte: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    }
    const result = await averagePurchaseStrategy('sku-1', ctx)
    expect(result).toBeNull()
  })

  it('calculates weighted average correctly', async () => {
    // (12.45×100 + 13.00×50 + 12.20×200) / 350 = 4335 / 350 ≈ 12.386
    ctx.db = {
      from: () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        gte: vi.fn().mockResolvedValue({
          data: [
            { unit_cost: 12.45, quantity: 100, currency: 'EUR' },
            { unit_cost: 13.00, quantity: 50,  currency: 'EUR' },
            { unit_cost: 12.20, quantity: 200, currency: 'EUR' },
          ],
          error: null,
        }),
      }),
    }
    const result = await averagePurchaseStrategy('sku-1', ctx)
    expect(result).not.toBeNull()
    expect(result!.currency).toBe('EUR')
    expect(result!.resolvedCost).toBeCloseTo(12.386, 2)
    expect(result!.sourceRecordType).toBe('purchase_history')
    expect(result!.sourceRecordId).toBeNull()
    expect(result!.sourceReference).toContain('3 records used')
    expect(result!.sourceReference).toContain('365d')
  })

  it('excludes records in the wrong currency', async () => {
    // 2 EUR records + 1 USD record — USD excluded
    ctx.db = {
      from: () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        gte: vi.fn().mockResolvedValue({
          data: [
            { unit_cost: 12.00, quantity: 100, currency: 'EUR' },
            { unit_cost: 14.00, quantity: 100, currency: 'EUR' },
            { unit_cost: 99.00, quantity: 100, currency: 'USD' },  // excluded
          ],
          error: null,
        }),
      }),
    }
    const result = await averagePurchaseStrategy('sku-1', ctx)
    expect(result).not.toBeNull()
    expect(result!.resolvedCost).toBe(13)  // (1200+1400)/200
    expect(result!.currency).toBe('EUR')
    expect(result!.sourceReference).toContain('1 excluded')
    expect(result!.sourceReference).toContain('USD')
  })

  it('returns null when all records are in the wrong currency', async () => {
    ctx.db = {
      from: () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        gte: vi.fn().mockResolvedValue({
          data: [
            { unit_cost: 10.00, quantity: 100, currency: 'USD' },
            { unit_cost: 11.00, quantity: 50,  currency: 'GBP' },
          ],
          error: null,
        }),
      }),
    }
    const result = await averagePurchaseStrategy('sku-1', ctx)
    expect(result).toBeNull()
  })

  it('uses the lookback window from context', async () => {
    const gteCalls: string[] = []
    ctx = makeCtx({ buildCurrency: 'EUR', averagePurchaseLookbackDays: 90 })
    ctx.db = {
      from: () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        gte: vi.fn().mockImplementation((col: string, val: string) => {
          gteCalls.push(`${col}:${val}`)
          return Promise.resolve({ data: [], error: null })
        }),
      }),
    }
    await averagePurchaseStrategy('sku-1', ctx)
    // The cutoff date should be ~90 days ago
    expect(gteCalls.some(c => c.startsWith('purchase_date:'))).toBe(true)
    const cutoff = gteCalls.find(c => c.startsWith('purchase_date:'))!.split(':')[1]
    const cutoffDate = new Date(cutoff)
    const diffDays = Math.round((Date.now() - cutoffDate.getTime()) / 86_400_000)
    expect(diffDays).toBeGreaterThanOrEqual(89)
    expect(diffDays).toBeLessThanOrEqual(91)
  })

  it('source reference includes lookback days and record count', async () => {
    ctx = makeCtx({ buildCurrency: 'EUR', averagePurchaseLookbackDays: 180 })
    ctx.db = {
      from: () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        gte: vi.fn().mockResolvedValue({
          data: [
            { unit_cost: 10, quantity: 1, currency: 'EUR' },
            { unit_cost: 12, quantity: 1, currency: 'EUR' },
          ],
          error: null,
        }),
      }),
    }
    const result = await averagePurchaseStrategy('sku-1', ctx)
    expect(result!.sourceReference).toContain('180d')
    expect(result!.sourceReference).toContain('2 records used')
  })
})

// ── Import validator — purchase_history ───────────────────────────────────────

describe('validatePurchaseHistory (via validateRows)', () => {
  it('validates required fields', async () => {
    const { validateRows } = await import('@/backend/lib/importValidators')
    const rows = [
      { col_part: 'SKU-001', col_date: '2026-01-15', col_qty: '100', col_cost: '12.45', col_ccy: 'EUR' },
    ]
    const mapping = {
      col_part: 'sku_part_number',
      col_date: 'purchase_date',
      col_qty:  'quantity',
      col_cost: 'unit_cost',
      col_ccy:  'currency',
    }
    const results = validateRows(rows, mapping, 'purchase_history')
    expect(results[0].status).toBe('valid')
  })

  it('errors on missing sku_part_number', async () => {
    const { validateRows } = await import('@/backend/lib/importValidators')
    const rows = [{ col_date: '2026-01-15', col_qty: '100', col_cost: '12.45', col_ccy: 'EUR' }]
    const mapping = { col_date: 'purchase_date', col_qty: 'quantity', col_cost: 'unit_cost', col_ccy: 'currency' }
    const results = validateRows(rows, mapping, 'purchase_history')
    expect(results[0].status).toBe('error')
    expect(results[0].errors.some(e => e.includes('sku_part_number'))).toBe(true)
  })

  it('errors on invalid date', async () => {
    const { validateRows } = await import('@/backend/lib/importValidators')
    const rows = [{ col_part: 'SKU-001', col_date: 'not-a-date', col_qty: '100', col_cost: '12.45', col_ccy: 'EUR' }]
    const mapping = { col_part: 'sku_part_number', col_date: 'purchase_date', col_qty: 'quantity', col_cost: 'unit_cost', col_ccy: 'currency' }
    const results = validateRows(rows, mapping, 'purchase_history')
    expect(results[0].status).toBe('error')
    expect(results[0].errors.some(e => e.includes('purchase_date'))).toBe(true)
  })

  it('warns on zero unit_cost', async () => {
    const { validateRows } = await import('@/backend/lib/importValidators')
    const rows = [{ col_part: 'SKU-001', col_date: '2026-01-15', col_qty: '100', col_cost: '0', col_ccy: 'EUR' }]
    const mapping = { col_part: 'sku_part_number', col_date: 'purchase_date', col_qty: 'quantity', col_cost: 'unit_cost', col_ccy: 'currency' }
    const results = validateRows(rows, mapping, 'purchase_history')
    expect(results[0].status).toBe('warning')
    expect(results[0].warnings.some(w => w.includes('zero'))).toBe(true)
  })

  it('errors on invalid currency code', async () => {
    const { validateRows } = await import('@/backend/lib/importValidators')
    const rows = [{ col_part: 'SKU-001', col_date: '2026-01-15', col_qty: '100', col_cost: '12', col_ccy: 'EU' }]
    const mapping = { col_part: 'sku_part_number', col_date: 'purchase_date', col_qty: 'quantity', col_cost: 'unit_cost', col_ccy: 'currency' }
    const results = validateRows(rows, mapping, 'purchase_history')
    expect(results[0].status).toBe('error')
    expect(results[0].errors.some(e => e.includes('currency'))).toBe(true)
  })

  it('errors on negative quantity', async () => {
    const { validateRows } = await import('@/backend/lib/importValidators')
    const rows = [{ col_part: 'SKU-001', col_date: '2026-01-15', col_qty: '-5', col_cost: '12', col_ccy: 'EUR' }]
    const mapping = { col_part: 'sku_part_number', col_date: 'purchase_date', col_qty: 'quantity', col_cost: 'unit_cost', col_ccy: 'currency' }
    const results = validateRows(rows, mapping, 'purchase_history')
    expect(results[0].status).toBe('error')
    expect(results[0].errors.some(e => e.includes('quantity'))).toBe(true)
  })
})
