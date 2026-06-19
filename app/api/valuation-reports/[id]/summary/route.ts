import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/backend/lib/supabase'

const VALID_GROUPS = ['family', 'item_type', 'item_cost_type'] as const
type GroupField = typeof VALID_GROUPS[number]

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const raw = request.nextUrl.searchParams.get('groupBy') ?? 'family'
    const groupField: GroupField = (VALID_GROUPS as readonly string[]).includes(raw)
      ? (raw as GroupField)
      : 'family'

    const db = client as any

    const { data: report, error: rErr } = await db
      .from('valuation_reports')
      .select('id, valuation_currency, total_value, line_count, missing_cost_count')
      .eq('id', params.id)
      .single()

    if (rErr || !report) return NextResponse.json({ error: 'Report not found' }, { status: 404 })

    const { data: lines, error: lErr } = await db
      .from('valuation_report_lines')
      .select('sku_id, quantity, line_total_valuation_currency, has_missing_cost, skus(family, item_type, item_cost_type)')
      .eq('report_id', params.id)

    if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 })

    type Group = { skus: Set<string>; lines: number; qty: number; value: number; missing: number }
    const groups = new Map<string, Group>()

    for (const line of (lines ?? []) as Array<{
      sku_id: string; quantity: number; line_total_valuation_currency: number | null
      has_missing_cost: boolean; skus: Record<string, string | null> | null
    }>) {
      const key = line.skus?.[groupField] ?? 'Uncategorized'
      if (!groups.has(key)) groups.set(key, { skus: new Set(), lines: 0, qty: 0, value: 0, missing: 0 })
      const g = groups.get(key)!
      g.skus.add(line.sku_id)
      g.lines++
      g.qty   += Number(line.quantity ?? 0)
      g.value += Number(line.line_total_valuation_currency ?? 0)
      if (line.has_missing_cost) g.missing++
    }

    const total = Number(report.total_value ?? 0)

    const summary = [...groups.entries()]
      .map(([group, g]) => ({
        group,
        sku_count:          g.skus.size,
        line_count:         g.lines,
        total_quantity:     g.qty,
        total_value:        g.value,
        missing_cost_count: g.missing,
        pct_of_total:       total > 0 ? (g.value / total) * 100 : 0,
      }))
      .sort((a, b) => b.total_value - a.total_value)

    return NextResponse.json({
      data: {
        summary,
        group_by:           groupField,
        total_value:        report.total_value,
        currency:           report.valuation_currency,
        line_count:         report.line_count,
        missing_cost_count: report.missing_cost_count,
      },
    })
  } catch (err) {
    console.error('[GET /api/valuation-reports/[id]/summary]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
