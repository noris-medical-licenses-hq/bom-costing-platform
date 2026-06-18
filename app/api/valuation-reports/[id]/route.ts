import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/backend/lib/supabase'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const db = client as any
    const { data: report, error: reportErr } = await db
      .from('valuation_reports')
      .select(`
        *,
        inventory_snapshots(id, snapshot_name, snapshot_date, snapshot_type, base_currency),
        cost_sets(id, name, base_currency, cost_set_type),
        profiles!valuation_reports_created_by_fkey(full_name, email),
        approved_profile:profiles!valuation_reports_approved_by_fkey(full_name, email)
      `)
      .eq('id', params.id)
      .single()

    if (reportErr || !report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    const [fxResult, wfResult, linesResult] = await Promise.all([
      db.from('valuation_report_exchange_rates')
        .select('from_currency, to_currency, rate, source, effective_date')
        .eq('report_id', params.id)
        .order('from_currency'),

      db.from('valuation_report_warehouse_filters')
        .select('warehouse_id, included, exclusion_reason, warehouses(code, name)')
        .eq('report_id', params.id),

      db.from('valuation_report_lines')
        .select(`
          id, quantity, source_currency, unit_cost_source_currency,
          exchange_rate_used, unit_cost_valuation_currency, line_total_valuation_currency,
          cost_source, has_missing_cost, notes,
          skus(part_number, name, item_type),
          warehouses(code, name)
        `)
        .eq('report_id', params.id)
        .order('line_total_valuation_currency', { ascending: false })
        .limit(200),
    ])

    return NextResponse.json({
      data: {
        ...report,
        exchangeRates:      fxResult.data ?? [],
        warehouseFilters:   wfResult.data ?? [],
        lines:              linesResult.data ?? [],
      },
    })
  } catch (err) {
    console.error('[GET /api/valuation-reports/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
