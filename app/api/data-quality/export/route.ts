/**
 * GET /api/data-quality/export
 *
 * Downloads a full multi-sheet Excel workbook of all data quality issues.
 * BG-018 + BG-020: Universal Failure Export Framework.
 */
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/backend/lib/supabase'
import { issueExcelResponse, type IssueRow } from '@/backend/lib/excelExport'

export async function GET() {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const db     = client as any
    const today  = new Date().toISOString().slice(0, 10)
    const cutoff = new Date(Date.now() - 90 * 86_400_000).toISOString()
    const cut1yr = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10)

    // ── Gather issues per section ──────────────────────────────────────────────

    const [s1, s2, s3, s4, s5] = await Promise.all([
      getCostingIssues(db, cutoff),
      getBomIssues(db),
      getMfgIssues(db),
      getPriceListIssues(db, cut1yr),
      getInventoryIssues(db),
    ])

    const filename = `data-quality-${today}`

    return issueExcelResponse([
      { name: 'Costing Health',       issues: s1 },
      { name: 'BOM Health',           issues: s2 },
      { name: 'Mfg Health',           issues: s3 },
      { name: 'Price List Health',    issues: s4 },
      { name: 'Inventory Health',     issues: s5 },
    ], filename)
  } catch (err) {
    console.error('[GET /api/data-quality/export]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

const NOW = new Date().toISOString()

async function getCostingIssues(db: any, cutoff: string): Promise<IssueRow[]> {
  const issues: IssueRow[] = []

  const { data: noType } = await db.from('skus')
    .select('id, part_number, name')
    .eq('status', 'active')
    .is('item_cost_type', null)
    .limit(2000)

  for (const s of (noType ?? []) as any[]) {
    issues.push({
      severity:      'WARNING',
      module:        'Costing',
      entity_type:   'SKU',
      entity_id:     s.id,
      sku:           s.part_number,
      error_code:    'COST_TYPE_MISSING',
      error_message: `SKU "${s.part_number}" has no item_cost_type set`,
      suggested_fix: 'Set item_cost_type (PURCHASED / MANUFACTURED / etc.) on the SKU',
      detected_at:   NOW,
    })
  }

  // Zero-cost lines from recent builds
  const { data: zeroLines } = await db.from('site_cost_build_lines')
    .select('sku_id, cost_strategy_used, skus(part_number, name), site_cost_builds(name, sites(name))')
    .gte('created_at', cutoff)
    .eq('resolved_cost', 0)
    .limit(2000)

  const seenZero = new Set<string>()
  for (const line of (zeroLines ?? []) as any[]) {
    if (seenZero.has(line.sku_id)) continue
    seenZero.add(line.sku_id)
    const sku  = line.skus
    const site = line.site_cost_builds?.sites
    issues.push({
      severity:      'CRITICAL',
      module:        'Costing',
      entity_type:   'SKU',
      entity_id:     line.sku_id,
      sku:           sku?.part_number ?? '',
      site:          site?.name ?? '',
      error_code:    'ZERO_COST_IN_BUILD',
      error_message: `SKU resolved to zero cost (strategy: ${line.cost_strategy_used})`,
      suggested_fix: 'Import price list, purchase history, or add a cost item for this SKU',
      detected_at:   NOW,
    })
  }

  return issues
}

async function getBomIssues(db: any): Promise<IssueRow[]> {
  const issues: IssueRow[] = []

  const { data: makeSkus } = await db.from('skus')
    .select('id, part_number, name')
    .eq('status', 'active')
    .eq('make_buy', 'make')
    .limit(2000)

  const makeArr = (makeSkus ?? []) as any[]
  const makeIds = makeArr.map((s: any) => s.id)

  let withBom = new Set<string>()
  if (makeIds.length > 0) {
    const { data: boms } = await db.from('boms').select('sku_id').in('sku_id', makeIds)
    for (const b of (boms ?? []) as any[]) withBom.add(b.sku_id)
  }

  for (const s of makeArr) {
    if (!withBom.has(s.id)) {
      issues.push({
        severity:      'CRITICAL',
        module:        'BOM',
        entity_type:   'SKU',
        entity_id:     s.id,
        sku:           s.part_number,
        error_code:    'MANUFACTURED_NO_BOM',
        error_message: `Manufactured SKU "${s.part_number}" has no BOM`,
        suggested_fix: 'Import BOM lines for this SKU or change make_buy to "buy"',
        detected_at:   NOW,
      })
    }
  }

  const { data: draftBoms } = await db.from('bom_versions')
    .select('id, version_number, boms(skus(part_number))')
    .eq('status', 'draft')
    .limit(1000)

  for (const bv of (draftBoms ?? []) as any[]) {
    const pn = bv.boms?.skus?.part_number ?? ''
    issues.push({
      severity:      'WARNING',
      module:        'BOM',
      entity_type:   'BOM Version',
      entity_id:     bv.id,
      sku:           pn,
      error_code:    'BOM_VERSION_DRAFT',
      error_message: `BOM v${bv.version_number} for "${pn}" is still in draft`,
      suggested_fix: 'Review and approve the BOM version before running a cost build',
      detected_at:   NOW,
    })
  }

  return issues
}

async function getMfgIssues(db: any): Promise<IssueRow[]> {
  const issues: IssueRow[] = []

  const { data: inactiveStructs } = await db.from('manufacturing_cost_structures')
    .select('id, name, skus(part_number)')
    .eq('is_active', false)
    .limit(500)

  for (const s of (inactiveStructs ?? []) as any[]) {
    issues.push({
      severity:      'INFO',
      module:        'Manufacturing',
      entity_type:   'Cost Structure',
      entity_id:     s.id,
      sku:           s.skus?.part_number ?? '',
      error_code:    'STRUCTURE_INACTIVE',
      error_message: `Structure "${s.name}" is inactive`,
      suggested_fix: 'Activate the structure if it should be used in cost builds',
      detected_at:   NOW,
    })
  }

  const { data: activeStructs } = await db.from('manufacturing_cost_structures')
    .select('id, name, skus(part_number)')
    .eq('is_active', true)
    .limit(500)

  const activeIds = ((activeStructs ?? []) as any[]).map((s: any) => s.id)
  if (activeIds.length > 0) {
    const { data: elements } = await db.from('mfg_cost_elements').select('structure_id').in('structure_id', activeIds)
    const withElements = new Set<string>()
    for (const e of (elements ?? []) as any[]) withElements.add(e.structure_id)

    for (const s of (activeStructs ?? []) as any[]) {
      if (!withElements.has(s.id)) {
        issues.push({
          severity:      'CRITICAL',
          module:        'Manufacturing',
          entity_type:   'Cost Structure',
          entity_id:     s.id,
          sku:           s.skus?.part_number ?? '',
          error_code:    'STRUCTURE_NO_ELEMENTS',
          error_message: `Active structure "${s.name}" has no cost elements`,
          suggested_fix: 'Add at least one cost element to this structure',
          detected_at:   NOW,
        })
      }
    }
  }

  return issues
}

async function getPriceListIssues(db: any, cut1yr: string): Promise<IssueRow[]> {
  const issues: IssueRow[] = []

  const [zeroRes, negRes, staleRes] = await Promise.all([
    db.from('price_list_version_items')
      .select('id, part_number, unit_price, price_list_versions!inner(price_list_id, country_price_lists(name, country_code))')
      .eq('price_list_versions.status', 'active')
      .eq('unit_price', 0)
      .limit(2000),
    db.from('price_list_version_items')
      .select('id, part_number, unit_price, price_list_versions!inner(country_price_lists(name, country_code))')
      .eq('price_list_versions.status', 'active')
      .lt('unit_price', 0)
      .limit(500),
    db.from('price_list_versions')
      .select('id, version_number, effective_date, country_price_lists(name, country_code)')
      .eq('status', 'active')
      .lt('effective_date', cut1yr)
      .limit(100),
  ])

  for (const item of (zeroRes.data ?? []) as any[]) {
    const pl = item.price_list_versions?.country_price_lists
    issues.push({
      severity:      'WARNING',
      module:        'Price List',
      entity_type:   'Price List Item',
      entity_id:     item.id,
      sku:           item.part_number,
      country:       pl?.country_code ?? '',
      error_code:    'ZERO_PRICE',
      error_message: `Part "${item.part_number}" has zero price in "${pl?.name ?? 'unknown'}" price list`,
      suggested_fix: 'Update the price or remove the line if the SKU is excluded',
      detected_at:   NOW,
    })
  }

  for (const item of (negRes.data ?? []) as any[]) {
    const pl = item.price_list_versions?.country_price_lists
    issues.push({
      severity:      'CRITICAL',
      module:        'Price List',
      entity_type:   'Price List Item',
      entity_id:     item.id,
      sku:           item.part_number,
      country:       pl?.country_code ?? '',
      error_code:    'NEGATIVE_PRICE',
      error_message: `Part "${item.part_number}" has negative price (${item.unit_price})`,
      suggested_fix: 'Correct the price in the source file and re-import',
      detected_at:   NOW,
    })
  }

  for (const v of (staleRes.data ?? []) as any[]) {
    const pl = v.country_price_lists
    issues.push({
      severity:      'INFO',
      module:        'Price List',
      entity_type:   'Price List Version',
      entity_id:     v.id,
      country:       pl?.country_code ?? '',
      error_code:    'STALE_PRICE_LIST',
      error_message: `"${pl?.name ?? 'unknown'}" v${v.version_number} effective ${v.effective_date} — over 1 year old`,
      suggested_fix: 'Import an updated price list or confirm this is still the current pricing',
      detected_at:   NOW,
    })
  }

  return issues
}

async function getInventoryIssues(db: any): Promise<IssueRow[]> {
  const issues: IssueRow[] = []

  const [draftRes, linesNoCostRes] = await Promise.all([
    db.from('inventory_snapshots')
      .select('id, snapshot_name, snapshot_date')
      .eq('status', 'draft')
      .limit(200),
    db.from('inventory_lines')
      .select('id, snapshot_id, skus(part_number)')
      .is('unit_cost', null)
      .limit(2000),
  ])

  for (const snap of (draftRes.data ?? []) as any[]) {
    issues.push({
      severity:      'WARNING',
      module:        'Inventory',
      entity_type:   'Snapshot',
      entity_id:     snap.id,
      error_code:    'SNAPSHOT_DRAFT',
      error_message: `Snapshot "${snap.snapshot_name}" (${snap.snapshot_date}) is still in draft`,
      suggested_fix: 'Run inventory valuation to value this snapshot',
      detected_at:   NOW,
    })
  }

  for (const line of (linesNoCostRes.data ?? []) as any[]) {
    issues.push({
      severity:      'WARNING',
      module:        'Inventory',
      entity_type:   'Inventory Line',
      entity_id:     line.id,
      sku:           line.skus?.part_number ?? '',
      error_code:    'LINE_NO_COST',
      error_message: `Inventory line for "${line.skus?.part_number ?? 'unknown'}" has no unit cost`,
      suggested_fix: 'Run inventory valuation to assign costs to this line',
      detected_at:   NOW,
    })
  }

  return issues
}
