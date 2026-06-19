import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/backend/lib/supabase'

const MAX_DEPTH = 5

type BuildLine = {
  sku_id: string
  item_cost_type: string
  cost_strategy_used: string
  source_record_type: string | null
  source_record_id: string | null
  source_reference: string | null
  resolved_cost: number
  currency: string
  fallback_path: unknown[]
  skus: { part_number: string | null; name: string | null } | null
}

type BomLine = {
  id: string
  sku_id: string | null
  quantity: number
  unit_of_measure: string
  position: number
  skus: { part_number: string | null; name: string | null } | null
}

export type ExplosionNode = {
  sku_id: string
  part_number: string | null
  name: string | null
  strategy: string
  source_reference: string | null
  resolved_cost: number
  currency: string
  bom_quantity?: number
  unit_of_measure?: string
  extended_cost?: number
  contribution_pct?: number
  is_leaf: boolean
  depth: number
  children: ExplosionNode[]
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string; skuId: string } }
) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const db = client as any
    const { buildId, skuId } = { buildId: params.id, skuId: params.skuId }

    // Verify build access and get metadata
    const { data: build, error: bErr } = await db
      .from('site_cost_builds')
      .select('id, organization_id, site_id, status, cost_sets(base_currency)')
      .eq('id', buildId)
      .single()

    if (bErr || !build) return NextResponse.json({ error: 'Build not found' }, { status: 404 })

    // Fetch ALL build lines for this build (needed for BOM component lookups)
    const { data: allLinesRaw, error: lErr } = await db
      .from('site_cost_build_lines')
      .select(`
        sku_id, item_cost_type, cost_strategy_used,
        source_record_type, source_record_id, source_reference,
        resolved_cost, currency, fallback_path,
        skus(part_number, name)
      `)
      .eq('site_cost_build_id', buildId)

    if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 })

    const linesBySkuId = new Map<string, BuildLine>()
    for (const l of (allLinesRaw ?? []) as BuildLine[]) {
      linesBySkuId.set(l.sku_id, l)
    }

    const rootLine = linesBySkuId.get(skuId)
    if (!rootLine) return NextResponse.json({ error: 'SKU not found in this build' }, { status: 404 })

    // BOM data cache: skuId → BomLine[]
    const bomCache = new Map<string, BomLine[]>()

    async function fetchBomLines(parentSkuId: string): Promise<BomLine[]> {
      if (bomCache.has(parentSkuId)) return bomCache.get(parentSkuId)!

      // Find the approved BOM version for this SKU
      const { data: bom } = await db
        .from('boms')
        .select('id')
        .eq('organization_id', build.organization_id)
        .eq('sku_id', parentSkuId)
        .maybeSingle()

      if (!bom) { bomCache.set(parentSkuId, []); return [] }

      const { data: version } = await db
        .from('bom_versions')
        .select('id')
        .eq('bom_id', bom.id)
        .eq('status', 'approved')
        .maybeSingle()

      if (!version) { bomCache.set(parentSkuId, []); return [] }

      const { data: lines } = await db
        .from('bom_lines')
        .select('id, sku_id, quantity, unit_of_measure, position, skus(part_number, name)')
        .eq('bom_version_id', version.id)
        .eq('line_type', 'sku')
        .is('parent_line_id', null)   // top-level components only
        .order('position')

      const result = (lines ?? []) as BomLine[]
      bomCache.set(parentSkuId, result)
      return result
    }

    async function explode(
      line: BuildLine,
      depth: number,
      parentCost: number,
      bomQty: number,
      uom: string
    ): Promise<ExplosionNode> {
      const isBomRollup = line.cost_strategy_used === 'BOM_ROLLUP'
      const children: ExplosionNode[] = []

      if (isBomRollup && depth < MAX_DEPTH) {
        const bomLines = await fetchBomLines(line.sku_id)
        for (const bl of bomLines) {
          if (!bl.sku_id) continue
          const childLine = linesBySkuId.get(bl.sku_id)
          if (!childLine) {
            children.push({
              sku_id: bl.sku_id,
              part_number: bl.skus?.part_number ?? null,
              name: bl.skus?.name ?? null,
              strategy: 'not_in_build',
              source_reference: null,
              resolved_cost: 0,
              currency: line.currency,
              bom_quantity: Number(bl.quantity),
              unit_of_measure: bl.unit_of_measure,
              extended_cost: 0,
              contribution_pct: 0,
              is_leaf: true,
              depth: depth + 1,
              children: [],
            })
            continue
          }
          const extCost = Number(bl.quantity) * Number(childLine.resolved_cost)
          const pct     = Number(line.resolved_cost) > 0
            ? (extCost / Number(line.resolved_cost)) * 100
            : 0
          const childNode = await explode(childLine, depth + 1, Number(line.resolved_cost), Number(bl.quantity), bl.unit_of_measure)
          children.push({ ...childNode, bom_quantity: Number(bl.quantity), unit_of_measure: bl.unit_of_measure, extended_cost: extCost, contribution_pct: pct })
        }
      }

      return {
        sku_id:          line.sku_id,
        part_number:     line.skus?.part_number ?? null,
        name:            line.skus?.name ?? null,
        strategy:        line.cost_strategy_used,
        source_reference: line.source_reference,
        resolved_cost:   Number(line.resolved_cost),
        currency:        line.currency,
        bom_quantity:    bomQty,
        unit_of_measure: uom,
        extended_cost:   bomQty > 0 ? bomQty * Number(line.resolved_cost) : undefined,
        contribution_pct: parentCost > 0 && bomQty > 0
          ? (bomQty * Number(line.resolved_cost) / parentCost) * 100
          : undefined,
        is_leaf: children.length === 0,
        depth,
        children,
      }
    }

    const tree = await explode(rootLine, 0, 0, 1, 'EA')

    return NextResponse.json({
      data: {
        build_id:   buildId,
        sku_id:     skuId,
        currency:   rootLine.currency,
        root:       tree,
        node_count: countNodes(tree),
        max_depth:  getMaxDepth(tree),
      }
    })
  } catch (err) {
    console.error('[GET /api/cost-builds/[id]/lines/[skuId]/explosion]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function countNodes(node: ExplosionNode): number {
  return 1 + node.children.reduce((sum, c) => sum + countNodes(c), 0)
}
function getMaxDepth(node: ExplosionNode): number {
  if (node.children.length === 0) return node.depth
  return Math.max(...node.children.map(getMaxDepth))
}
