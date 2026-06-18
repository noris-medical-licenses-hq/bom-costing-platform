import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/backend/lib/supabase'

export async function GET() {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await client
      .from('warehouses')
      .select('id, code, name, warehouse_type, site_id, sites(code, name)')
      .order('name')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: data ?? [] })
  } catch (err) {
    console.error('[GET /api/warehouses]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
