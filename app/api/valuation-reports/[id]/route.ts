import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/backend/lib/supabase'

const PAGE_SIZE = 500

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const page     = Math.max(1, parseInt(request.nextUrl.searchParams.get('page')     ?? '1', 10))
    const pageSize = Math.min(PAGE_SIZE, Math.max(1, parseInt(request.nextUrl.searchParams.get('pageSize') ?? String(PAGE_SIZE), 10)))
    const offset   = (page - 1) * pageSize

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

    const [fxResult, wfResult, linesResult, linesTotalResult] = await Promise.all([
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
        .range(offset, offset + pageSize - 1),

      db.from('valuation_report_lines')
        .select('id', { count: 'exact', head: true })
        .eq('report_id', params.id),
    ])

    const linesTotal = linesTotalResult.count ?? 0
    const totalPages = Math.max(1, Math.ceil(linesTotal / pageSize))

    return NextResponse.json({
      data: {
        ...report,
        exchangeRates:    fxResult.data ?? [],
        warehouseFilters: wfResult.data ?? [],
        lines:            linesResult.data ?? [],
        linesTotal,
        linesPage:        page,
        linesPageSize:    pageSize,
        linesTotalPages:  totalPages,
      },
    })
  } catch (err) {
    console.error('[GET /api/valuation-reports/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
