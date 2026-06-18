import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '../../../../../backend/lib/supabase'

type RouteParams = { params: { id: string } }

export async function GET(_: NextRequest, { params }: RouteParams) {
  const client = await createServerSupabaseClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await client
    .from('rule_execution_traces')
    .select('id, cost_rule_id, rule_name_snapshot, condition_result, was_applied, value_before, value_after, delta')
    .eq('trace_id', params.id)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}
