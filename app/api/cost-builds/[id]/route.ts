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

    const [buildRes, linesRes] = await Promise.all([
      db.from('site_cost_builds')
        .select(`
          id, name, description, default_strategy, status,
          line_count, error_count, built_at, created_at, notes,
          parameters_snapshot,
          sites(id, name, code),
          cost_sets(id, name, base_currency, is_frozen)
        `)
        .eq('id', params.id)
        .single(),

      db.from('site_cost_build_lines')
        .select(`
          id, sku_id, item_cost_type, cost_strategy_used,
          source_record_type, source_record_id, source_reference,
          fallback_path, resolved_cost, currency, effective_from,
          skus(part_number, name, sku_type)
        `)
        .eq('site_cost_build_id', params.id)
        .order('item_cost_type')
        .order('resolved_cost', { ascending: false })
        .limit(2000),
    ])

    if (buildRes.error) {
      if (buildRes.error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      return NextResponse.json({ error: buildRes.error.message }, { status: 500 })
    }

    return NextResponse.json({
      data:  buildRes.data,
      lines: linesRes.data ?? [],
    })
  } catch (err) {
    console.error('[GET /api/cost-builds/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
