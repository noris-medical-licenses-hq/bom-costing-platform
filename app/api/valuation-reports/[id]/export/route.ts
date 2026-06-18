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

    const { data: report } = await db
      .from('valuation_reports')
      .select('id, valuation_currency, valuation_scenario, fx_snapshot_name, inventory_snapshots(snapshot_name, snapshot_date), cost_sets(name)')
      .eq('id', params.id)
      .single()

    if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 })

    const { data: lines } = await db
      .from('valuation_report_lines')
      .select(`
        quantity, source_currency, unit_cost_source_currency,
        exchange_rate_used, unit_cost_valuation_currency, line_total_valuation_currency,
        cost_source, has_missing_cost,
        skus(part_number, name),
        warehouses(code, name)
      `)
      .eq('report_id', params.id)
      .order('line_total_valuation_currency', { ascending: false })

    const ccy = report.valuation_currency
    const rows = [
      `"Valuation Report Export"`,
      `"Snapshot","${report.inventory_snapshots?.snapshot_name ?? ''}","${report.inventory_snapshots?.snapshot_date ?? ''}"`,
      `"Cost Set","${report.cost_sets?.name ?? ''}"`,
      `"Valuation Currency","${ccy}"`,
      `"Scenario","${report.valuation_scenario}"`,
      `"FX Snapshot","${report.fx_snapshot_name ?? ''}"`,
      ``,
      [
        '"Part Number"',
        '"SKU Name"',
        '"Warehouse"',
        '"Quantity"',
        '"Source Currency"',
        `"Unit Cost (Source)"`,
        '"Exchange Rate"',
        `"Unit Cost (${ccy})"`,
        `"Line Total (${ccy})"`,
        '"Cost Source"',
        '"Missing Cost"',
      ].join(','),
      ...(lines ?? []).map((l: any) => [
        `"${l.skus?.part_number ?? ''}"`,
        `"${l.skus?.name ?? ''}"`,
        `"${l.warehouses?.name ?? l.warehouses?.code ?? ''}"`,
        l.quantity ?? '',
        `"${l.source_currency ?? ''}"`,
        l.unit_cost_source_currency ?? '',
        l.exchange_rate_used ?? '',
        l.unit_cost_valuation_currency ?? '',
        l.line_total_valuation_currency ?? '',
        `"${l.cost_source ?? ''}"`,
        l.has_missing_cost ? 'YES' : 'NO',
      ].join(',')),
    ]

    const csv = rows.join('\r\n')
    const snapshotName = (report.inventory_snapshots?.snapshot_name ?? 'export').replace(/[^a-zA-Z0-9-_]/g, '_')
    const filename = `valuation_${snapshotName}_${ccy}_${new Date().toISOString().slice(0, 10)}.csv`

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    console.error('[GET /api/valuation-reports/[id]/export]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
