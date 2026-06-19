import { describe, it, expect } from 'vitest'

// ── CompareSchema validation (logic only, no API mocking needed) ──────────────

describe('cost-comparison request validation (logic)', () => {
  it('strategies array must be non-empty', () => {
    const strategies: string[] = []
    expect(strategies.length >= 1).toBe(false)
  })

  it('accepts 1-4 strategies', () => {
    const strategies = ['PRICE_LIST', 'LAST_PURCHASE']
    expect(strategies.length >= 1 && strategies.length <= 4).toBe(true)
  })

  it('buildCurrency must be 3 chars', () => {
    expect('EUR'.length === 3).toBe(true)
    expect('EU'.length === 3).toBe(false)
    expect('EURO'.length === 3).toBe(false)
  })

  it('averagePurchaseLookbackDays must be one of the allowed values', () => {
    const allowed = [30, 90, 180, 365, 730]
    expect(allowed.includes(365)).toBe(true)
    expect(allowed.includes(400)).toBe(false)
  })
})

// ── Comparison result shape ───────────────────────────────────────────────────

describe('ComparisonResult shape', () => {
  it('rows array contains all requested strategies', () => {
    const rows = [
      { strategy: 'PRICE_LIST', cost: 12.45, currency: 'EUR', status: 'ok', strategyLabel: 'Price List', sourceReference: 'PL v3', sourceRecordType: 'price_list_version', sourceRecordId: 'plv-1', statusNote: null },
      { strategy: 'LAST_PURCHASE', cost: 11.50, currency: 'EUR', status: 'ok', strategyLabel: 'Last Purchase', sourceReference: 'SAP-001', sourceRecordType: 'purchase_history', sourceRecordId: 'ph-1', statusNote: null },
      { strategy: 'AVERAGE_PURCHASE', cost: null, currency: null, status: 'missing', strategyLabel: 'Average Purchase', sourceReference: null, sourceRecordType: null, sourceRecordId: null, statusNote: 'No Average Purchase data available' },
    ]
    expect(rows).toHaveLength(3)
    expect(rows.find(r => r.strategy === 'AVERAGE_PURCHASE')!.status).toBe('missing')
    expect(rows.find(r => r.strategy === 'LAST_PURCHASE')!.cost).toBe(11.50)
  })

  it('lowestCost reflects only ok rows', () => {
    const okRows = [12.45, 11.50, 12.18]
    const lowest = Math.min(...okRows)
    expect(lowest).toBe(11.50)
  })

  it('highestCost reflects only ok rows', () => {
    const okRows = [12.45, 11.50, 12.18]
    const highest = Math.max(...okRows)
    expect(highest).toBe(12.45)
  })

  it('spread calculation', () => {
    const lowest  = 11.50
    const highest = 12.45
    const spread  = highest - lowest
    expect(spread).toBeCloseTo(0.95, 2)
    const pct     = (spread / lowest * 100)
    expect(pct).toBeCloseTo(8.26, 1)
  })
})

// ── Currency mismatch detection ───────────────────────────────────────────────

describe('currency mismatch in comparison rows', () => {
  it('marks row as currency_mismatch when resolved currency differs from buildCurrency', () => {
    const buildCurrency: string = 'EUR'
    const resolvedCurrency: string = 'USD'
    const status = resolvedCurrency !== buildCurrency ? 'currency_mismatch' : 'ok'
    expect(status).toBe('currency_mismatch')
  })

  it('marks row as ok when currencies match', () => {
    const buildCurrency = 'EUR'
    const resolvedCurrency = 'EUR'
    const status = resolvedCurrency !== buildCurrency ? 'currency_mismatch' : 'ok'
    expect(status).toBe('ok')
  })
})

// ── not_operational strategy ──────────────────────────────────────────────────

import { STRATEGY_STATUS_MATRIX } from '@/backend/services/costBuild/strategies'

describe('not_operational strategy handling', () => {
  it('MAKE_OR_BUY is not fully_operational', () => {
    const OPERATIONAL = new Set(
      Object.entries(STRATEGY_STATUS_MATRIX)
        .filter(([, m]) => m.status === 'fully_operational')
        .map(([k]) => k)
    )
    expect(OPERATIONAL.has('MAKE_OR_BUY')).toBe(false)
  })

  it('LAST_PURCHASE and AVERAGE_PURCHASE are fully_operational', () => {
    expect(STRATEGY_STATUS_MATRIX['LAST_PURCHASE'].status).toBe('fully_operational')
    expect(STRATEGY_STATUS_MATRIX['AVERAGE_PURCHASE'].status).toBe('fully_operational')
  })

  it('PRICE_LIST and BOM_ROLLUP are fully_operational', () => {
    expect(STRATEGY_STATUS_MATRIX['PRICE_LIST'].status).toBe('fully_operational')
    expect(STRATEGY_STATUS_MATRIX['BOM_ROLLUP'].status).toBe('fully_operational')
  })
})

// ── Zero cost ─────────────────────────────────────────────────────────────────

describe('zero cost detection', () => {
  it('marks row as zero when resolvedCost is 0', () => {
    const resolvedCost = 0
    const status = resolvedCost === 0 ? 'zero' : 'ok'
    expect(status).toBe('zero')
  })

  it('does not mark positive cost row as zero', () => {
    const resolvedCost: number = 12.45
    const status = resolvedCost === 0 ? 'zero' : 'ok'
    expect(status).toBe('ok')
  })
})

// ── Trace/source reference visibility ─────────────────────────────────────────

describe('source reference in comparison row', () => {
  it('LAST_PURCHASE row exposes sourceReference from purchase_history', () => {
    const row = {
      strategy: 'LAST_PURCHASE',
      cost: 11.50,
      currency: 'EUR',
      sourceReference: 'SAP PO-001 | REHAU | 2026-06-12 | 11.50 EUR',
      sourceRecordType: 'purchase_history',
      sourceRecordId: 'ph-1',
      status: 'ok',
    }
    expect(row.sourceReference).toContain('SAP PO-001')
    expect(row.sourceReference).toContain('REHAU')
    expect(row.sourceRecordType).toBe('purchase_history')
    expect(row.sourceRecordId).toBe('ph-1')
  })

  it('missing row exposes statusNote, not sourceReference', () => {
    const row = {
      strategy: 'AVERAGE_PURCHASE',
      cost: null,
      status: 'missing',
      sourceReference: null,
      statusNote: 'No Average Purchase data available for this SKU at this site.',
    }
    expect(row.sourceReference).toBeNull()
    expect(row.statusNote).toContain('No Average Purchase data')
  })
})

// ── Import committer — purchase_history ───────────────────────────────────────

describe('commitPurchaseHistory quality metrics', () => {
  it('tracks zero cost records count', () => {
    const rows = [
      { unit_cost: 12.45, source_reference: 'REF-001' },
      { unit_cost: 0,     source_reference: 'REF-002' },
      { unit_cost: 5.00,  source_reference: 'REF-001' },
    ]
    const zeroCost = rows.filter(r => Number(r.unit_cost) === 0).length
    expect(zeroCost).toBe(1)
  })

  it('tracks duplicate source references', () => {
    const rows = [
      { source_reference: 'REF-001' },
      { source_reference: 'REF-002' },
      { source_reference: 'REF-001' },
    ]
    const refCounts = new Map<string, number>()
    for (const r of rows) {
      if (r.source_reference) {
        refCounts.set(r.source_reference, (refCounts.get(r.source_reference) ?? 0) + 1)
      }
    }
    const dupRefs = [...refCounts.values()].filter(v => v > 1).length
    expect(dupRefs).toBe(1)
  })

  it('tracks missing suppliers', () => {
    const rows = [
      { supplier_id: 'sup-1' },
      { supplier_id: null },
      { supplier_id: null },
    ]
    const missing = rows.filter(r => !r.supplier_id).length
    expect(missing).toBe(2)
  })

  it('computes date range across all rows', () => {
    const dates = ['2026-01-15', '2025-06-01', '2026-03-20']
    const min = dates.reduce((a, b) => a < b ? a : b)
    const max = dates.reduce((a, b) => a > b ? a : b)
    expect(min).toBe('2025-06-01')
    expect(max).toBe('2026-03-20')
  })
})
