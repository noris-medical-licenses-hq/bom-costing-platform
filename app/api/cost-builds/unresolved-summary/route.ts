import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/backend/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const db = client as any
    const days    = Math.min(365, Math.max(1, parseInt(request.nextUrl.searchParams.get('days') ?? '90', 10)))
    const siteId  = request.nextUrl.searchParams.get('siteId') ?? null
    const cutoff  = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    const orgResult = await client.rpc('auth_org_id').maybeSingle()
    const orgId     = (orgResult.data as string | null) ?? ''

    // Step 1: Get recent completed/approved/locked builds
    let buildsQ = db
      .from('site_cost_builds')
      .select('id, name, created_at, site_id, status, sites(id, name, code)')
      .eq('organization_id', orgId)
      .gte('created_at', cutoff)
      .in('status', ['complete', 'complete_with_warnings', 'approved', 'locked'])
      .order('created_at', { ascending: false })
      .limit(50)

    if (siteId) buildsQ = buildsQ.eq('site_id', siteId)

    const { data: builds, error: bErr } = await buildsQ
    if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 })
    if (!builds || builds.length === 0) {
      return NextResponse.json({ data: { skus: [], build_count: 0, days, sku_count: 0 } })
    }

    const buildIds = (builds as Array<{ id: string }>).map(b => b.id)

    // Step 2: Get zero-cost lines from those builds
    const { data: zeroLines, error: zErr } = await db
      .from('site_cost_build_lines')
      .select(`
        sku_id, cost_strategy_used, site_cost_build_id,
        skus(id, part_number, name, family, item_type, item_cost_type)
      `)
      .eq('organization_id', orgId)
      .in('site_cost_build_id', buildIds)
      .eq('resolved_cost', 0)
      .limit(2000)

    if (zErr) return NextResponse.json({ error: zErr.message }, { status: 500 })

    // Build lookup: buildId → build metadata
    const buildMap = new Map<string, { name: string; site_id: string; sites: { name: string; code: string } | null }>(
      (builds as Array<{ id: string; name: string; site_id: string; status: string; sites: { id: string; name: string; code: string } | null }>)
        .map(b => [b.id, { name: b.name, site_id: b.site_id, sites: b.sites }])
    )

    // Aggregate zero-cost lines by SKU
    type SkuGroup = {
      sku_id: string
      part_number: string | null
      name: string | null
      family: string | null
      item_type: string | null
      item_cost_type: string | null
      zero_count: number
      build_names: string[]
      site_names: string[]
      strategies: Set<string>
    }

    const bySkuId = new Map<string, SkuGroup>()

    for (const line of (zeroLines ?? []) as Array<{
      sku_id: string; cost_strategy_used: string; site_cost_build_id: string
      skus: { id: string; part_number: string | null; name: string | null; family: string | null; item_type: string | null; item_cost_type: string | null } | null
    }>) {
      const build = buildMap.get(line.site_cost_build_id)
      if (!bySkuId.has(line.sku_id)) {
        bySkuId.set(line.sku_id, {
          sku_id:        line.sku_id,
          part_number:   line.skus?.part_number ?? null,
          name:          line.skus?.name ?? null,
          family:        line.skus?.family ?? null,
          item_type:     line.skus?.item_type ?? null,
          item_cost_type: line.skus?.item_cost_type ?? null,
          zero_count:    0,
          build_names:   [],
          site_names:    [],
          strategies:    new Set(),
        })
      }
      const g = bySkuId.get(line.sku_id)!
      g.zero_count++
      if (build && !g.build_names.includes(build.name)) g.build_names.push(build.name)
      const siteName = build?.sites?.name ?? build?.site_id ?? ''
      if (siteName && !g.site_names.includes(siteName)) g.site_names.push(siteName)
      if (line.cost_strategy_used) g.strategies.add(line.cost_strategy_used)
    }

    const skus = [...bySkuId.values()]
      .map(g => ({
        sku_id:        g.sku_id,
        part_number:   g.part_number,
        name:          g.name,
        family:        g.family,
        item_type:     g.item_type,
        item_cost_type: g.item_cost_type,
        zero_count:    g.zero_count,
        build_names:   g.build_names,
        site_names:    g.site_names,
        strategies:    [...g.strategies],
      }))
      .sort((a, b) => b.zero_count - a.zero_count)

    return NextResponse.json({
      data: {
        skus,
        sku_count:   skus.length,
        build_count: builds.length,
        days,
      }
    })
  } catch (err) {
    console.error('[GET /api/cost-builds/unresolved-summary]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
