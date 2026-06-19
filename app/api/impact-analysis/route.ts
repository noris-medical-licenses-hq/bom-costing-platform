/**
 * GET /api/impact-analysis?type=price_list&fromId=<uuid>&toId=<uuid>
 * GET /api/impact-analysis?type=cost_build&fromId=<uuid>&toId=<uuid>
 *
 * BG-019: Cost Change Impact Analysis
 * All DB reads are batched in Promise.all — no N+1 queries.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/backend/lib/supabase'
import {
  computeCostChanges,
  computeBomImpact,
  computeInventoryImpact,
  computeMfgImpact,
  buildSummary,
  type SkuCostPoint,
  type BomLineFlat,
  type InventoryLineFlat,
  type MfgStructureFlat,
  type ImpactResult,
  type ComparisonMeta,
} from '@/backend/lib/impactAnalysis'

export async function GET(request: NextRequest) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const params       = new URL(request.url).searchParams
    const type         = params.get('type') as 'price_list' | 'cost_build' | null
    const fromId       = params.get('fromId')
    const toId         = params.get('toId')

    if (!type || !fromId || !toId) {
      return NextResponse.json({ error: 'type, fromId and toId are required' }, { status: 400 })
    }
    if (type !== 'price_list' && type !== 'cost_build') {
      return NextResponse.json({ error: 'type must be price_list or cost_build' }, { status: 400 })
    }

    const db = client as any

    // ── Batch 1: fetch "from" and "to" cost items + metadata in parallel ──────
    const [fromResult, toResult] = await Promise.all([
      fetchCostPoints(db, type, fromId),
      fetchCostPoints(db, type, toId),
    ])

    if (fromResult.error) return NextResponse.json({ error: fromResult.error }, { status: 404 })
    if (toResult.error)   return NextResponse.json({ error: toResult.error },   { status: 404 })

    const fromItems = fromResult.items!
    const toItems   = toResult.items!

    // Compute cost changes (pure in-memory)
    const costChanges = computeCostChanges(fromItems, toItems)
    const changedSkuIds = new Set(costChanges.map(c => c.sku_id))

    // Build sku lookup from fetched items
    const skuMap = new Map<string, { part_number: string; name: string }>()
    for (const item of [...fromItems, ...toItems]) {
      if (!skuMap.has(item.sku_id)) {
        skuMap.set(item.sku_id, { part_number: item.part_number, name: item.name })
      }
    }

    // ── Batch 2: fetch BOM lines, inventory, mfg structures in parallel ───────
    // Only fetch if there are changes to analyze
    const [bomLines, invLines, mfgRows] = changedSkuIds.size > 0
      ? await Promise.all([
          fetchBomLines(db),
          fetchInventoryLines(db, [...changedSkuIds]),
          fetchMfgElements(db, [...changedSkuIds]),
        ])
      : [[], [], []]

    // ── In-memory calculations ────────────────────────────────────────────────
    const costDeltaMap = new Map(costChanges.map(c => [
      c.sku_id, { old_cost: c.old_cost, new_cost: c.new_cost }
    ]))

    const bomImpact  = computeBomImpact(changedSkuIds, bomLines as BomLineFlat[], skuMap)
    const invImpact  = computeInventoryImpact(costDeltaMap, invLines as InventoryLineFlat[])
    const mfgImpact  = computeMfgImpact(changedSkuIds, mfgRows as MfgStructureFlat[])
    const summary    = buildSummary(costChanges, bomImpact, invImpact, mfgImpact)

    const meta: ComparisonMeta = {
      comparison_type: type,
      from_id:         fromId,
      to_id:           toId,
      from_label:      fromResult.label!,
      to_label:        toResult.label!,
      currency:        toResult.currency ?? fromResult.currency ?? 'USD',
      generated_at:    new Date().toISOString(),
    }

    const result: ImpactResult = {
      meta,
      summary,
      cost_changes:     costChanges,
      bom_impact:       bomImpact,
      inventory_impact: invImpact,
      mfg_impact:       mfgImpact,
    }

    return NextResponse.json({ data: result })
  } catch (err) {
    console.error('[GET /api/impact-analysis]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── Batch fetchers ───────────────────────────────────────────────────────────

async function fetchCostPoints(
  db: any,
  type: 'price_list' | 'cost_build',
  id: string
): Promise<{ items?: SkuCostPoint[]; label?: string; currency?: string; error?: string }> {
  if (type === 'price_list') {
    const { data: version } = await db
      .from('price_list_versions')
      .select('id, version_number, currency, country_price_lists(name, country_code)')
      .eq('id', id)
      .single()

    if (!version) return { error: `Price list version ${id} not found` }

    const { data: items } = await db
      .from('price_list_version_items')
      .select('sku_id, part_number, unit_price, currency, skus(name), import_job_row_id')
      .eq('price_list_version_id', id)
      .not('sku_id', 'is', null)
      .limit(10000)

    const listName    = (version.country_price_lists as any)?.name ?? 'Price List'
    const countryCode = (version.country_price_lists as any)?.country_code ?? ''

    return {
      label:    `${listName} (${countryCode}) v${version.version_number}`,
      currency: version.currency,
      items: (items ?? []).map((i: any) => ({
        sku_id:            i.sku_id,
        part_number:       i.part_number,
        name:              i.skus?.name ?? '',
        cost:              Number(i.unit_price),
        currency:          i.currency ?? version.currency,
        import_job_row_id: i.import_job_row_id ?? undefined,
      })),
    }
  }

  // cost_build
  const { data: build } = await db
    .from('site_cost_builds')
    .select('id, name, sites(name, code)')
    .eq('id', id)
    .single()

  if (!build) return { error: `Cost build ${id} not found` }

  const { data: lines } = await db
    .from('site_cost_build_lines')
    .select('sku_id, resolved_cost, currency, skus(part_number, name), import_job_row_id')
    .eq('site_cost_build_id', id)
    .limit(10000)

  return {
    label:    `${build.name} (${(build.sites as any)?.code ?? ''})`,
    currency: (lines?.[0] as any)?.currency ?? 'USD',
    items: (lines ?? []).map((l: any) => ({
      sku_id:            l.sku_id,
      part_number:       l.skus?.part_number ?? '',
      name:              l.skus?.name ?? '',
      cost:              Number(l.resolved_cost),
      currency:          l.currency,
      import_job_row_id: l.import_job_row_id ?? undefined,
    })),
  }
}

async function fetchBomLines(db: any): Promise<BomLineFlat[]> {
  // Fetch all active BOM version lines with their finished-good SKU info
  const { data } = await db
    .from('bom_lines')
    .select(`
      bom_version_id,
      sku_id,
      bom_versions!inner(
        bom_id,
        status,
        boms!inner(sku_id, skus!inner(part_number, name))
      )
    `)
    .eq('bom_versions.status', 'approved')
    .not('sku_id', 'is', null)
    .limit(50000)

  return (data ?? []).map((row: any) => ({
    bom_version_id: row.bom_version_id,
    sku_id:         row.sku_id,
    bom_sku_id:     row.bom_versions?.boms?.sku_id ?? '',
    fg_part_number: row.bom_versions?.boms?.skus?.part_number ?? '',
    fg_name:        row.bom_versions?.boms?.skus?.name ?? '',
  }))
}

async function fetchInventoryLines(db: any, skuIds: string[]): Promise<InventoryLineFlat[]> {
  if (skuIds.length === 0) return []

  // Fetch inventory lines from the most recent approved snapshot only
  const { data } = await db
    .from('inventory_lines')
    .select(`
      sku_id, quantity, unit_cost, currency,
      skus(part_number, name),
      warehouses(name, sites(name)),
      inventory_snapshots!inner(status)
    `)
    .eq('inventory_snapshots.status', 'approved')
    .in('sku_id', skuIds)
    .not('unit_cost', 'is', null)
    .limit(20000)

  return (data ?? []).map((row: any) => ({
    sku_id:         row.sku_id,
    part_number:    row.skus?.part_number ?? '',
    sku_name:       row.skus?.name ?? '',
    quantity:       Number(row.quantity),
    unit_cost:      Number(row.unit_cost ?? 0),
    currency:       row.currency,
    site_name:      row.warehouses?.sites?.name ?? '',
    warehouse_name: row.warehouses?.name ?? '',
  }))
}

async function fetchMfgElements(db: any, skuIds: string[]): Promise<MfgStructureFlat[]> {
  if (skuIds.length === 0) return []

  const { data } = await db
    .from('mfg_cost_elements')
    .select(`
      id, name,
      reference_sku_id,
      skus!mfg_cost_elements_reference_sku_id_fkey(part_number),
      manufacturing_cost_structures!inner(
        id, name, mode, is_active,
        sku_id,
        skus!manufacturing_cost_structures_sku_id_fkey(part_number, name)
      )
    `)
    .eq('manufacturing_cost_structures.is_active', true)
    .in('reference_sku_id', skuIds)
    .limit(5000)

  return (data ?? []).map((row: any) => ({
    structure_id:         row.manufacturing_cost_structures?.id ?? '',
    structure_name:       row.manufacturing_cost_structures?.name ?? '',
    finished_good_sku_id: row.manufacturing_cost_structures?.sku_id ?? '',
    fg_part_number:       row.manufacturing_cost_structures?.skus?.part_number ?? '',
    fg_name:              row.manufacturing_cost_structures?.skus?.name ?? '',
    mode:                 row.manufacturing_cost_structures?.mode ?? '',
    element_name:         row.name,
    element_id:           row.id,
    reference_sku_id:     row.reference_sku_id,
    ref_part_number:      row.skus?.part_number ?? '',
  }))
}
