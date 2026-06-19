/**
 * GET /api/cost-builds/export-issues?buildId=<uuid>
 *
 * Downloads an Excel file of all zero-cost, unresolved, or warning lines
 * from a specific cost build. BG-020: Universal Failure Export Framework.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/backend/lib/supabase'
import { issueExcelResponse, type IssueRow } from '@/backend/lib/excelExport'

export async function GET(request: NextRequest) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const buildId = new URL(request.url).searchParams.get('buildId')
    if (!buildId) return NextResponse.json({ error: 'buildId is required' }, { status: 400 })

    const db = client as any

    // Load build metadata
    const { data: build, error: buildErr } = await db
      .from('site_cost_builds')
      .select('id, name, status, sites(name, code)')
      .eq('id', buildId)
      .single()

    if (buildErr || !build) return NextResponse.json({ error: 'Build not found' }, { status: 404 })

    // Load zero-cost and unresolved lines
    const { data: lines, error: linesErr } = await db
      .from('site_cost_build_lines')
      .select(`
        id, sku_id, item_cost_type, cost_strategy_used, source_record_type,
        source_reference, resolved_cost, currency, fallback_path,
        skus(part_number, name, item_type)
      `)
      .eq('site_cost_build_id', buildId)
      .eq('resolved_cost', 0)
      .order('skus(part_number)', { ascending: true })
      .limit(5000)

    if (linesErr) return NextResponse.json({ error: linesErr.message }, { status: 500 })

    const now      = new Date().toISOString()
    const siteName = (build.sites as any)?.name ?? ''
    const issues: IssueRow[] = []

    for (const line of (lines ?? []) as any[]) {
      const sku      = line.skus?.part_number ?? ''
      const strategy = line.cost_strategy_used ?? 'none'
      const fallback = (line.fallback_path as string[] | null) ?? []

      const suggested = strategy === 'PRICE_LIST'
        ? 'Import an updated price list that includes this SKU'
        : strategy === 'LAST_PURCHASE' || strategy === 'AVERAGE_PURCHASE'
          ? 'Import purchase history records for this SKU'
          : strategy === 'MFG_COST_ROLLUP'
            ? 'Check manufacturing cost structure — ensure all elements have costs'
            : 'Add a cost item for this SKU in the active cost set'

      issues.push({
        severity:      'CRITICAL',
        module:        'Cost Build',
        entity_type:   'SKU',
        entity_id:     line.sku_id,
        sku,
        site:          siteName,
        error_code:    'ZERO_RESOLVED_COST',
        error_message: `"${sku}" resolved to 0 cost (strategy: ${strategy}${fallback.length ? ', fallback: ' + fallback.join('→') : ''})`,
        suggested_fix: suggested,
        detected_at:   now,
      })
    }

    const safeName = String(build.name).replace(/[^a-z0-9_-]/gi, '_').slice(0, 40)
    return issueExcelResponse(
      [{ name: 'Build Issues', issues }],
      `build-issues-${safeName}`
    )
  } catch (err) {
    console.error('[GET /api/cost-builds/export-issues]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
