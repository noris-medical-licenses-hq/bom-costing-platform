/**
 * GET /api/data-quality
 *
 * Master Data Quality health metrics — BG-018.
 * Runs 5 parallel query groups and returns counts + sample records
 * for each section. Scoped to the caller's organisation via RLS.
 */
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/backend/lib/supabase'

const NOW = () => new Date().toISOString()

export async function GET() {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const db = client as any
    const today = new Date().toISOString().slice(0, 10)
    const cutoff90 = new Date(Date.now() - 90 * 86_400_000).toISOString()

    // ── Run all sections in parallel ─────────────────────────────────────────

    const [
      costingRes,
      bomRes,
      mfgRes,
      priceListRes,
      inventoryRes,
    ] = await Promise.all([
      fetchCostingHealth(db, cutoff90),
      fetchBomHealth(db),
      fetchMfgHealth(db),
      fetchPriceListHealth(db, today),
      fetchInventoryHealth(db),
    ])

    return NextResponse.json({
      data: {
        generated_at: NOW(),
        costing:     costingRes,
        bom:         bomRes,
        mfg:         mfgRes,
        price_list:  priceListRes,
        inventory:   inventoryRes,
      }
    })
  } catch (err) {
    console.error('[GET /api/data-quality]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── Section 1: Costing Health ────────────────────────────────────────────────

async function fetchCostingHealth(db: any, cutoff90: string) {
  const [skuNoTypeRes, zeroLinesRes] = await Promise.all([
    // SKUs with no item_cost_type (no costing strategy assigned)
    db.from('skus')
      .select('id, part_number, name, item_type', { count: 'exact', head: false })
      .eq('status', 'active')
      .is('item_cost_type', null)
      .limit(50),

    // SKUs that resolved to 0 cost in recent builds
    db.from('site_cost_build_lines')
      .select(`
        sku_id,
        skus(part_number, name, family),
        site_cost_builds(name, sites(name, code))
      `)
      .gte('created_at', cutoff90)
      .eq('resolved_cost', 0)
      .limit(200),
  ])

  const zeroBySkuId = new Map<string, {
    part_number: string; name: string; family: string | null
    build_names: string[]; site_names: string[]
  }>()
  for (const line of (zeroLinesRes.data ?? []) as any[]) {
    const sku   = line.skus
    const build = line.site_cost_builds
    const site  = build?.sites
    if (!sku) continue
    const existing = zeroBySkuId.get(line.sku_id)
    if (!existing) {
      zeroBySkuId.set(line.sku_id, {
        part_number: sku.part_number,
        name:        sku.name,
        family:      sku.family ?? null,
        build_names: build?.name ? [build.name] : [],
        site_names:  site?.name  ? [site.name]  : [],
      })
    } else {
      if (build?.name && !existing.build_names.includes(build.name)) existing.build_names.push(build.name)
      if (site?.name  && !existing.site_names.includes(site.name))   existing.site_names.push(site.name)
    }
  }

  return {
    skus_without_cost_type:   { count: skuNoTypeRes.count ?? 0, sample: (skuNoTypeRes.data ?? []).slice(0, 20) },
    skus_zero_cost_in_builds: { count: zeroBySkuId.size, sample: [...zeroBySkuId.values()].slice(0, 20) },
  }
}

// ─── Section 2: BOM Health ────────────────────────────────────────────────────

async function fetchBomHealth(db: any) {
  const [makeNoBoMRes, draftBomRes] = await Promise.all([
    // Manufactured SKUs (make_buy='make') with no BOM header
    db.from('skus')
      .select('id, part_number, name, item_type')
      .eq('status', 'active')
      .eq('make_buy', 'make')
      .limit(500),

    // BOM versions still in 'draft' (not approved)
    db.from('bom_versions')
      .select(`
        id, version_number, status, created_at,
        boms(skus(part_number, name))
      `)
      .eq('status', 'draft')
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  // Cross-reference: which make SKUs have no BOM?
  const makeSkus = (makeNoBoMRes.data ?? []) as any[]
  const makeSkuIds = makeSkus.map((s: any) => s.id) as string[]

  let skusWithBom = new Set<string>()
  if (makeSkuIds.length > 0) {
    const { data: bomData } = await db
      .from('boms')
      .select('sku_id')
      .in('sku_id', makeSkuIds)
    for (const b of (bomData ?? []) as any[]) skusWithBom.add(b.sku_id)
  }

  const makeSkusNoBom = makeSkus.filter((s: any) => !skusWithBom.has(s.id))

  return {
    manufactured_skus_without_bom: { count: makeSkusNoBom.length, sample: makeSkusNoBom.slice(0, 20) },
    bom_versions_in_draft:         { count: draftBomRes.count ?? (draftBomRes.data?.length ?? 0), sample: (draftBomRes.data ?? []).slice(0, 20) },
  }
}

// ─── Section 3: Manufacturing Health ─────────────────────────────────────────

async function fetchMfgHealth(db: any) {
  const [inactiveStructRes, noElementRes] = await Promise.all([
    db.from('manufacturing_cost_structures')
      .select('id, name, skus(part_number, name)', { count: 'exact', head: false })
      .eq('is_active', false)
      .limit(50),

    // Active structures with NO elements
    db.from('manufacturing_cost_structures')
      .select(`id, name, skus(part_number, name)`)
      .eq('is_active', true)
      .limit(200),
  ])

  const activeStructIds = ((inactiveStructRes.data ? [] : []) as any[])
  // For "no elements": get element counts
  const activeStructs = (noElementRes.data ?? []) as any[]
  const structIds = activeStructs.map((s: any) => s.id)

  let structsWithElements = new Set<string>()
  if (structIds.length > 0) {
    const { data: elemData } = await db
      .from('mfg_cost_elements')
      .select('structure_id')
      .in('structure_id', structIds)
    for (const e of (elemData ?? []) as any[]) structsWithElements.add(e.structure_id)
  }

  const activeStructsNoElements = activeStructs.filter((s: any) => !structsWithElements.has(s.id))

  return {
    inactive_structures:              { count: inactiveStructRes.count ?? 0, sample: (inactiveStructRes.data ?? []).slice(0, 20) },
    active_structures_without_elements: { count: activeStructsNoElements.length, sample: activeStructsNoElements.slice(0, 20) },
  }
}

// ─── Section 4: Price List Health ────────────────────────────────────────────

async function fetchPriceListHealth(db: any, today: string) {
  const cutoff1yr = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10)

  const [zeroPriceRes, negPriceRes, oldActiveRes] = await Promise.all([
    // Items with zero price in active versions
    db.from('price_list_version_items')
      .select(`
        id, part_number, unit_price,
        price_list_versions!inner(status, price_list_id, country_price_lists(name, country_code))
      `)
      .eq('price_list_versions.status', 'active')
      .eq('unit_price', 0)
      .limit(100),

    // Items with negative price in active versions
    db.from('price_list_version_items')
      .select(`
        id, part_number, unit_price,
        price_list_versions!inner(status, country_price_lists(name, country_code))
      `)
      .eq('price_list_versions.status', 'active')
      .lt('unit_price', 0)
      .limit(50),

    // Active price list versions older than 1 year (potentially stale)
    db.from('price_list_versions')
      .select(`
        id, version_number, effective_date, status, imported_at,
        country_price_lists(name, country_code)
      `)
      .eq('status', 'active')
      .lt('effective_date', cutoff1yr)
      .order('effective_date', { ascending: true })
      .limit(20),
  ])

  return {
    items_with_zero_price:     { count: zeroPriceRes.data?.length ?? 0, sample: (zeroPriceRes.data ?? []).slice(0, 20) },
    items_with_negative_price: { count: negPriceRes.data?.length ?? 0,  sample: (negPriceRes.data ?? []).slice(0, 20) },
    stale_active_versions:     { count: oldActiveRes.data?.length ?? 0, sample: (oldActiveRes.data ?? []).slice(0, 10) },
  }
}

// ─── Section 5: Inventory Health ─────────────────────────────────────────────

async function fetchInventoryHealth(db: any) {
  const [draftSnapRes, noValRes, linesNoCostRes] = await Promise.all([
    db.from('inventory_snapshots')
      .select('id, snapshot_name, snapshot_date, status, created_at', { count: 'exact', head: false })
      .eq('status', 'draft')
      .order('created_at', { ascending: false })
      .limit(20),

    // Approved snapshots with no valuation report
    db.from('inventory_snapshots')
      .select('id, snapshot_name, snapshot_date')
      .eq('status', 'approved')
      .limit(100),

    // Lines without a unit_cost (not yet valued)
    db.from('inventory_lines')
      .select('id, sku_id, snapshot_id, skus(part_number, name)', { count: 'exact', head: false })
      .is('unit_cost', null)
      .limit(50),
  ])

  // Find approved snapshots with no valuation report
  const approvedSnaps = (noValRes.data ?? []) as any[]
  const snapIds = approvedSnaps.map((s: any) => s.id)
  let snapsWithReport = new Set<string>()
  if (snapIds.length > 0) {
    const { data: vrData } = await db
      .from('valuation_reports')
      .select('snapshot_id')
      .in('snapshot_id', snapIds)
    for (const vr of (vrData ?? []) as any[]) snapsWithReport.add(vr.snapshot_id)
  }

  const approvedNoReport = approvedSnaps.filter((s: any) => !snapsWithReport.has(s.id))

  return {
    snapshots_in_draft:             { count: draftSnapRes.count ?? 0, sample: (draftSnapRes.data ?? []).slice(0, 10) },
    approved_snapshots_no_report:   { count: approvedNoReport.length, sample: approvedNoReport.slice(0, 10) },
    inventory_lines_without_cost:   { count: linesNoCostRes.count ?? 0, sample: (linesNoCostRes.data ?? []).slice(0, 20) },
  }
}
