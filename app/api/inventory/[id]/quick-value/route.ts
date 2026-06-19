import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/backend/lib/supabase'
import { runValuationReport } from '@/backend/services/valuationReport'

const Schema = z.object({
  buildId:  z.string().uuid(),
  currency: z.string().length(3).default('EUR'),
  scenario: z.enum(['month_end', 'audit', 'management', 'budget', 'forecast']).default('management'),
})

// One-click valuation: resolves cost set from build, creates report, runs engine, returns result.
// Called from the Smart Valuation Wizard on the inventory list page.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const snapshotId = params.id

    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const orgIdResult = await client.rpc('auth_org_id').maybeSingle()
    const orgId = (orgIdResult.data as string | null) ?? ''
    if (!orgId) return NextResponse.json({ error: 'No organization found' }, { status: 403 })

    const body = await request.json()
    const parsed = Schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
    }

    const { buildId, currency, scenario } = parsed.data
    const db   = client as any
    const svc  = createServiceSupabaseClient()
    const svcDb = svc as any

    // Resolve cost_set_id from the cost build
    const { data: build } = await db
      .from('site_cost_builds')
      .select('id, name, status, cost_set_id, cost_sets(id, name, base_currency), sites(name)')
      .eq('id', buildId)
      .maybeSingle()

    if (!build) {
      return NextResponse.json({ error: 'Cost Build not found' }, { status: 404 })
    }
    if (!['complete', 'approved', 'locked'].includes(build.status)) {
      return NextResponse.json({ error: `Cost Build is "${build.status}" — must be complete, approved, or locked to use for valuation` }, { status: 400 })
    }
    const costSetId: string | null = (build.cost_sets as any)?.id ?? build.cost_set_id ?? null
    if (!costSetId) {
      return NextResponse.json({ error: 'Cost Build has no frozen Cost Set. Run the build first.' }, { status: 400 })
    }

    // Create the valuation report record
    const { data: report, error: reportErr } = await svcDb
      .from('valuation_reports')
      .insert({
        organization_id:      orgId,
        snapshot_id:          snapshotId,
        cost_set_id:          costSetId,
        valuation_currency:   currency,
        valuation_scenario:   scenario,
        exchange_rate_source: 'stored',
        warehouse_filter:     'all',
        status:               'draft',
        created_by:           user.id,
        updated_by:           user.id,
        notes:                `Quick valuation — ${build.name} (${currency})`,
      })
      .select('id')
      .single()

    if (reportErr || !report) {
      return NextResponse.json({ error: reportErr?.message ?? 'Failed to create valuation report' }, { status: 500 })
    }

    const reportId: string = report.id

    // Run valuation engine
    const result = await runValuationReport(reportId, svc)

    // Audit
    await svcDb.from('audit_log').insert({
      organization_id: orgId,
      event_type:      'valuation_executed',
      event_category:  'data',
      table_name:      'valuation_reports',
      record_id:       reportId,
      performed_by:    user.id,
      new_values: {
        snapshot_id:        snapshotId,
        cost_set_id:        costSetId,
        valuation_currency: currency,
        valuation_scenario: scenario,
        total_value:        result.totalValue,
        line_count:         result.lineCount,
        missing_cost_count: result.missingCostCount,
      },
    })

    return NextResponse.json({
      data: {
        reportId,
        totalValue:       result.totalValue,
        lineCount:        result.lineCount,
        missingCostCount: result.missingCostCount,
        currency,
        buildName:        build.name,
        siteName:         (build.sites as any)?.name ?? null,
      },
    }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/inventory/[id]/quick-value]', err)
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 })
  }
}
