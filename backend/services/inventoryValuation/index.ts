// Inventory Valuation Orchestration Service
// Flow: Snapshot → Cost Resolution → Rule Application → Trace → Valuation Results
// Every line gets a cost_trace_id so the result is fully explainable.

import type { SupabaseServerClient } from '../../lib/supabase'
import { findCostSetById, resolveCostItemForSku, findBestSupplierPrice, findActiveManualAdjustment } from '../../repositories/costRepository'
import { findSnapshotById, listInventoryLines, upsertInventoryLines, insertValuationResults } from '../../repositories/inventoryRepository'
import { findSkusByIds } from '../../repositories/skuRepository'
import { createTrace, completeTrace } from '../../repositories/traceRepository'
import { calculateCost } from '../costEngine'

const ENGINE_VERSION = '1.0.0'

export interface InventoryValuationInput {
  snapshotId: string
  /** Force re-valuation even if lines already have costs */
  force?: boolean
}

export interface InventoryValuationResult {
  snapshotId: string
  totalValue: number
  totalQuantity: number
  lineCount: number
  missingCostCount: number
  currency: string
  durationMs: number
}

export async function runInventoryValuation(
  input: InventoryValuationInput,
  client: SupabaseServerClient
): Promise<InventoryValuationResult> {
  const startMs = Date.now()
  const snapshot = await findSnapshotById(input.snapshotId, client)

  if (snapshot.status === 'approved') {
    throw new Error('Cannot re-value an approved snapshot. Create a new snapshot instead.')
  }

  const costSet = await findCostSetById(snapshot.cost_set_id, client)
  const valuationDate = snapshot.snapshot_date
  const currency = snapshot.base_currency

  const { data: { user } } = await client.auth.getUser()
  const orgIdResult = await client.rpc('auth_org_id').maybeSingle()
  const orgId = (orgIdResult.data as string | null) ?? ''

  const lines = await listInventoryLines(input.snapshotId, client)
  if (lines.length === 0) {
    throw new Error('Snapshot has no inventory lines. Add lines before running valuation.')
  }

  // Load all referenced SKUs in one query
  const skuIds = [...new Set(lines.map(l => l.sku_id))]
  const skus = await findSkusByIds(skuIds, client)
  const skuMap = new Map(skus.map(s => [s.id, s]))

  // ── Phase 1: Resolve cost for each SKU ──────────────────────────────────────

  type LineCostResult = {
    lineId: string
    skuId: string
    warehouseId: string
    quantity: number
    unitCost: number | null
    totalValue: number | null
    costSource: 'cost_set_item' | 'supplier_price' | 'bom_rollup' | 'manual_adjustment' | 'none'
    hasMissingCost: boolean
    bomVersionId: string | null
    traceId: string | null
  }

  const results: LineCostResult[] = []

  for (const line of lines) {
    const sku = skuMap.get(line.sku_id)
    if (!sku) {
      results.push({
        lineId: line.id,
        skuId: line.sku_id,
        warehouseId: line.warehouse_id,
        quantity: line.quantity,
        unitCost: null,
        totalValue: null,
        costSource: 'none',
        hasMissingCost: true,
        bomVersionId: null,
        traceId: null,
      })
      continue
    }

    // For make items with a BOM, use the cost engine rollup
    if (sku.make_buy === 'make' || sku.make_buy === 'make_or_buy') {
      const bomResult = await tryBomRollup(sku.id, costSet.id, valuationDate, orgId, user?.id ?? '', client)
      if (bomResult) {
        results.push({
          lineId: line.id,
          skuId: line.sku_id,
          warehouseId: line.warehouse_id,
          quantity: line.quantity,
          unitCost: bomResult.unitCost,
          totalValue: bomResult.unitCost * line.quantity,
          costSource: 'bom_rollup',
          hasMissingCost: false,
          bomVersionId: bomResult.bomVersionId,
          traceId: bomResult.traceId,
        })
        continue
      }
    }

    // Direct cost resolution (buy items and make items without approved BOMs)
    const resolved = await resolveCostForSku(sku, costSet.id, valuationDate, client)
    if (resolved) {
      results.push({
        lineId: line.id,
        skuId: line.sku_id,
        warehouseId: line.warehouse_id,
        quantity: line.quantity,
        unitCost: resolved.unitCost,
        totalValue: resolved.unitCost * line.quantity,
        costSource: resolved.source,
        hasMissingCost: false,
        bomVersionId: null,
        traceId: null,
      })
    } else {
      results.push({
        lineId: line.id,
        skuId: line.sku_id,
        warehouseId: line.warehouse_id,
        quantity: line.quantity,
        unitCost: null,
        totalValue: null,
        costSource: 'none',
        hasMissingCost: true,
        bomVersionId: null,
        traceId: null,
      })
    }
  }

  // ── Phase 2: Write resolved costs back to inventory_lines ────────────────────

  await upsertInventoryLines(
    results.map(r => ({
      id: r.lineId,
      organization_id: orgId,
      snapshot_id: input.snapshotId,
      sku_id: r.skuId,
      warehouse_id: r.warehouseId,
      quantity: r.quantity,
      unit_cost: r.unitCost,
      total_value: r.totalValue,
      currency,
      cost_source: r.costSource,
      has_missing_cost: r.hasMissingCost,
      bom_version_id: r.bomVersionId,
      cost_trace_id: r.traceId,
      created_by: user?.id ?? '',
      updated_by: user?.id ?? '',
    })),
    client
  )

  // ── Phase 3: Compute aggregated valuation results ────────────────────────────

  // Group by warehouse and by family/subfamily
  const resultMap = new Map<string, { lineCount: number; totalQty: number; totalVal: number; missingCount: number }>()

  for (const r of results) {
    const sku = skuMap.get(r.skuId)
    const familyId = sku?.family_id ?? null
    const subfamilyId = sku?.subfamily_id ?? null
    const warehouseId = r.warehouseId

    // Aggregate at 3 levels: global, by warehouse, by family+subfamily
    const keys = [
      `global::null::null::null`,
      `warehouse::${warehouseId}::null::null`,
      `family::null::${familyId ?? 'none'}::${subfamilyId ?? 'none'}`,
    ]

    for (const key of keys) {
      const acc = resultMap.get(key) ?? { lineCount: 0, totalQty: 0, totalVal: 0, missingCount: 0 }
      acc.lineCount++
      acc.totalQty += r.quantity
      acc.totalVal += r.totalValue ?? 0
      acc.missingCount += r.hasMissingCost ? 1 : 0
      resultMap.set(key, acc)
    }
  }

  const valuationResults: Parameters<typeof insertValuationResults>[0] = []
  for (const [key, acc] of resultMap.entries()) {
    const parts = key.split('::')
    valuationResults.push({
      organization_id: orgId,
      snapshot_id: input.snapshotId,
      family_id: parts[2] !== 'none' && parts[2] !== 'null' ? parts[2] : null,
      subfamily_id: parts[3] !== 'none' && parts[3] !== 'null' ? parts[3] : null,
      warehouse_id: parts[1] !== 'null' && parts[0] === 'warehouse' ? parts[1] : null,
      line_count: acc.lineCount,
      total_quantity: acc.totalQty,
      total_value: acc.totalVal,
      missing_cost_count: acc.missingCount,
      currency,
    })
  }
  await insertValuationResults(valuationResults, client)

  // ── Phase 4: Update snapshot totals ──────────────────────────────────────────

  const totalValue = results.reduce((s, r) => s + (r.totalValue ?? 0), 0)
  const totalQuantity = results.reduce((s, r) => s + r.quantity, 0)
  const missingCostCount = results.filter(r => r.hasMissingCost).length

  await client.from('inventory_snapshots').update({
    total_value: totalValue,
    total_quantity: totalQuantity,
    line_count: results.length,
    missing_cost_count: missingCostCount,
    status: 'under_review',
    updated_by: user?.id ?? '',
    updated_at: new Date().toISOString(),
  }).eq('id', input.snapshotId)

  return {
    snapshotId: input.snapshotId,
    totalValue,
    totalQuantity,
    lineCount: results.length,
    missingCostCount,
    currency,
    durationMs: Date.now() - startMs,
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function tryBomRollup(
  skuId: string,
  costSetId: string,
  valuationDate: string,
  _orgId: string,
  _userId: string,
  client: SupabaseServerClient
): Promise<{ unitCost: number; bomVersionId: string; traceId: string } | null> {
  // Find the BOM for this SKU
  const { data: bom } = await client.from('boms').select('id').eq('sku_id', skuId).maybeSingle()
  if (!bom) return null

  try {
    const result = await calculateCost({
      bomId: bom.id,
      costSetId,
      valuationDate,
      traceLevel: 'summary',
    }, client)

    // Get the bomVersionId from the trace
    const { data: trace } = await client
      .from('calculation_traces')
      .select('bom_version_id')
      .eq('id', result.traceId)
      .single()

    return {
      unitCost: result.totalUnitCost,
      bomVersionId: trace?.bom_version_id ?? '',
      traceId: result.traceId,
    }
  } catch {
    // No approved BOM or calculation error — fall through to direct cost
    return null
  }
}

type DirectCostSource = 'cost_set_item' | 'supplier_price' | 'manual_adjustment'

async function resolveCostForSku(
  sku: Awaited<ReturnType<typeof findSkusByIds>>[number],
  costSetId: string,
  valuationDate: string,
  client: SupabaseServerClient
): Promise<{ unitCost: number; source: DirectCostSource } | null> {
  // Priority 0: manual adjustment
  const adj = await findActiveManualAdjustment(sku.id, costSetId, client)
  if (adj) return { unitCost: adj.adjusted_unit_cost, source: 'manual_adjustment' }

  // Priority 1-5: cost_set_item
  const costItem = await resolveCostItemForSku(
    sku.id,
    sku.subfamily_id,
    sku.family_id,
    sku.default_supplier_id,
    null,
    costSetId,
    'material_price',
    client
  )
  if (costItem) return { unitCost: costItem.item.value, source: 'cost_set_item' }

  // Priority 6: supplier price
  const price = await findBestSupplierPrice(sku.id, sku.default_supplier_id, valuationDate, client)
  if (price) return { unitCost: price.unit_price, source: 'supplier_price' }

  return null
}
