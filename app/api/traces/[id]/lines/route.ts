import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '../../../../../backend/lib/supabase'

type RouteParams = { params: { id: string } }

export async function GET(_: NextRequest, { params }: RouteParams) {
  const client = await createServerSupabaseClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await client
    .from('calculation_trace_lines')
    .select('id, sku_id, depth, quantity, resolved_unit_cost, adjusted_unit_cost, line_total, cost_source_type, has_missing_cost, warnings')
    .eq('trace_id', params.id)
    .order('depth', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}
