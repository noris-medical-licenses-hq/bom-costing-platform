import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '../../../../backend/lib/supabase'

type RouteParams = { params: { id: string } }

export async function GET(_: NextRequest, { params }: RouteParams) {
  const client = await createServerSupabaseClient()
  const { data, error } = await client
    .from('calculation_traces')
    .select('*')
    .eq('id', params.id)
    .single()
  if (error || !data) return NextResponse.json({ error: 'Trace not found' }, { status: 404 })
  return NextResponse.json({ data })
}
