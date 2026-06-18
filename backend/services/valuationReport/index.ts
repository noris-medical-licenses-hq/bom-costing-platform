// Inventory Valuation Report Engine
// Computes frozen per-line values against a chosen cost set and currency.
// Does NOT modify inventory_lines or inventory_snapshots.
// All computed values are written to valuation_report_lines (write-once).

import type { SupabaseServiceClient } from '../../lib/supabase'

export interface ValuationReportResult {
  totalValue: number
  lineCount: number
  missingCostCount: number
  durationMs: number
}

const CHUNK_SIZE = 500

export async function runValuationReport(
  reportId: string,
  client: SupabaseServiceClient
): Promise<ValuationReportResult> {
  const startMs = Date.now()
  const db = client as any

  // ── 1. Load report ──────────────────────────────────────────────────────────

  const { data: report, error: reportErr } = await db
    .from('valuation_reports')
    .select('*, inventory_snapshots(snapshot_date, base_currency)')
    .eq('id', reportId)
    .single()

  if (reportErr || !report) throw new Error(`Valuation report not found: ${reportId}`)

  await db.from('valuation_reports')
    .update({ status: 'running', updated_at: new Date().toISOString() })
    .eq('id', reportId)

  const valuationDate: string = report.inventory_snapshots?.snapshot_date
    ?? new Date().toISOString().slice(0, 10)

  // ── 2. Build FX rate lookup (frozen rates already stored on the report) ──────

  const { data: fxRows } = await db
    .from('valuation_report_exchange_rates')
    .select('from_currency, to_currency, rate')
    .eq('report_id', reportId)

  const fxMap = new Map<string, number>()
  for (const fx of fxRows ?? []) {
    fxMap.set(`${fx.from_currency}:${fx.to_currency}`, Number(fx.rate))
    fxMap.set(`${fx.to_currency}:${fx.from_currency}`, 1 / Number(fx.rate))
  }
  // Identity rates need no entry — handled inline with === check

  function getFxRate(from: string, to: string): number | null {
    if (from === to) return 1.0
    return fxMap.get(`${from}:${to}`) ?? null
  }

  // ── 3. Build warehouse inclusion set ────────────────────────────────────────

  const hasSelectedFilter = report.warehouse_filter === 'selected'
  const { data: wfRows } = await db
    .from('valuation_report_warehouse_filters')
    .select('warehouse_id, included')
    .eq('report_id', reportId)

  const whIncluded = new Map<string, boolean>()
  for (const wf of wfRows ?? []) whIncluded.set(wf.warehouse_id, wf.included)

  function isWarehouseIncluded(warehouseId: string): boolean {
    if (!hasSelectedFilter) return true
    if (!whIncluded.has(warehouseId)) return true
    return whIncluded.get(warehouseId) === true
  }

  // ── 4. Load inventory lines for the snapshot ─────────────────────────────────

  const { data: lines, error: linesErr } = await db
    .from('inventory_lines')
    .select('id, sku_id, warehouse_id, quantity')
    .eq('snapshot_id', report.snapshot_id)

  if (linesErr || !lines?.length) {
    await db.from('valuation_reports')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', reportId)
    throw new Error('Snapshot has no inventory lines')
  }

  const filteredLines = (lines as Array<{ id: string; sku_id: string; warehouse_id: string; quantity: number }>)
    .filter(l => isWarehouseIncluded(l.warehouse_id))

  // ── 5. Bulk-load SKU metadata ────────────────────────────────────────────────

  const skuIds = [...new Set(filteredLines.map(l => l.sku_id))]
  const { data: skuRows } = await db
    .from('skus')
    .select('id, make_buy, family_id, subfamily_id, default_supplier_id')
    .in('id', skuIds)

  const skuMap = new Map<string, { make_buy: string; family_id: string | null; subfamily_id: string | null; default_supplier_id: string | null }>()
  for (const s of skuRows ?? []) skuMap.set(s.id, s)

  // ── 6. Bulk-load cost items for the cost set ─────────────────────────────────

  const { data: costItemRows } = await db
    .from('cost_items')
    .select('id, scope_type, scope_id, value, currency, item_type')
    .eq('cost_set_id', report.cost_set_id)
    .eq('item_type', 'material_price')
    .eq('is_active', true)
    .lte('effective_from', valuationDate)
    .order('effective_from', { ascending: false })

  type CostItemRow = { id: string; scope_type: string; scope_id: string | null; value: number; currency: string }
  const costItems: CostItemRow[] = costItemRows ?? []

  // Build lookup: keep highest effective_from per key (already sorted DESC, so first wins)
  const costByKey = new Map<string, CostItemRow>()
  for (const ci of costItems) {
    const key = ci.scope_type === 'global' ? 'global:' : `${ci.scope_type}:${ci.scope_id}`
    if (!costByKey.has(key)) costByKey.set(key, ci)
  }

  function resolveCostItem(skuId: string): { cost: CostItemRow; source: string } | null {
    const sku = skuMap.get(skuId)
    if (!sku) return null

    const precedences: Array<[string, string | null]> = [
      ['sku', skuId],
      ['subfamily', sku.subfamily_id],
      ['family', sku.family_id],
      ['global', null],
    ]
    for (const [scopeType, scopeId] of precedences) {
      if (scopeType !== 'global' && !scopeId) continue
      const key = scopeType === 'global' ? 'global:' : `${scopeType}:${scopeId}`
      const found = costByKey.get(key)
      if (found) return { cost: found, source: 'cost_set_item' }
    }
    return null
  }

  // ── 7. Bulk-load supplier prices as fallback ──────────────────────────────────

  const { data: spRows } = await db
    .from('supplier_prices')
    .select('id, sku_id, unit_price, currency, supplier_id')
    .in('sku_id', skuIds)
    .lte('effective_from', valuationDate)
    .or(`effective_to.is.null,effective_to.gte.${valuationDate}`)
    .order('unit_price', { ascending: true })

  type SpRow = { id: string; sku_id: string; unit_price: number; currency: string; supplier_id: string }
  const spBySku = new Map<string, SpRow[]>()
  for (const sp of (spRows ?? []) as SpRow[]) {
    const arr = spBySku.get(sp.sku_id) ?? []
    arr.push(sp)
    spBySku.set(sp.sku_id, arr)
  }

  function resolveSupplierPrice(skuId: string): { cost: { id: string; value: number; currency: string }; source: string } | null {
    const sku = skuMap.get(skuId)
    const prices = spBySku.get(skuId) ?? []
    if (!prices.length) return null
    const defaultSupplier = sku?.default_supplier_id
    const preferred = defaultSupplier ? prices.find(p => p.supplier_id === defaultSupplier) : null
    const sp = preferred ?? prices[0]
    return { cost: { id: sp.id, value: sp.unit_price, currency: sp.currency }, source: 'supplier_price' }
  }

  // ── 8. Compute lines ─────────────────────────────────────────────────────────

  const reportLines: Record<string, unknown>[] = []
  let totalValue = 0
  let lineCount = 0
  let missingCostCount = 0

  for (const line of filteredLines) {
    const costResolved = resolveCostItem(line.sku_id) ?? resolveSupplierPrice(line.sku_id)

    const sourceCcy    = costResolved?.cost.currency ?? report.valuation_currency
    const unitCostSrc  = costResolved?.cost.value ?? null
    const costItemId   = costResolved?.source === 'cost_set_item'
      ? (costResolved as { cost: CostItemRow; source: string }).cost.id
      : null
    const fxRate       = getFxRate(sourceCcy, report.valuation_currency)
    const unitCostVal  = unitCostSrc != null && fxRate != null ? unitCostSrc * fxRate : null
    const lineTotal    = unitCostVal != null ? line.quantity * unitCostVal : null
    const hasMissing   = costResolved === null || fxRate === null

    if (hasMissing) missingCostCount++
    if (lineTotal != null) totalValue += lineTotal
    lineCount++

    reportLines.push({
      report_id:                     reportId,
      snapshot_line_id:              line.id,
      sku_id:                        line.sku_id,
      warehouse_id:                  line.warehouse_id,
      quantity:                      line.quantity,
      source_currency:               sourceCcy,
      unit_cost_source_currency:     unitCostSrc,
      exchange_rate_used:            fxRate ?? 1,
      unit_cost_valuation_currency:  unitCostVal,
      line_total_valuation_currency: lineTotal,
      cost_item_id:                  costItemId,
      cost_source:                   costResolved?.source ?? 'none',
      has_missing_cost:              hasMissing,
    })
  }

  // ── 9. Write lines in chunks ─────────────────────────────────────────────────

  for (let i = 0; i < reportLines.length; i += CHUNK_SIZE) {
    const { error: insertErr } = await db
      .from('valuation_report_lines')
      .insert(reportLines.slice(i, i + CHUNK_SIZE))
    if (insertErr) throw new Error(`Failed to insert report lines: ${insertErr.message}`)
  }

  // ── 10. Update report with totals ────────────────────────────────────────────

  const parametersSnapshot = {
    snapshotId:          report.snapshot_id,
    costSetId:           report.cost_set_id,
    valuationCurrency:   report.valuation_currency,
    valuationScenario:   report.valuation_scenario,
    exchangeRateSource:  report.exchange_rate_source,
    fxSnapshotName:      report.fx_snapshot_name,
    warehouseFilter:     report.warehouse_filter,
    totalValue,
    lineCount,
    missingCostCount,
    runAt:               new Date().toISOString(),
    durationMs:          Date.now() - startMs,
  }

  await db.from('valuation_reports').update({
    status:             'complete',
    total_value:        totalValue,
    line_count:         lineCount,
    missing_cost_count: missingCostCount,
    parameters_snapshot: parametersSnapshot,
    completed_at:       new Date().toISOString(),
    updated_at:         new Date().toISOString(),
  }).eq('id', reportId)

  return { totalValue, lineCount, missingCostCount, durationMs: Date.now() - startMs }
}
