import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/backend/lib/supabase'

type RouteParams = { params: { id: string } }

// GET /api/price-lists/[id]/items?limit=100&offset=0
// Returns price_list_version_items for a given price_list_version.
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const db     = client as any
    const limit  = Math.min(parseInt(request.nextUrl.searchParams.get('limit') ?? '200', 10), 1000)
    const offset = parseInt(request.nextUrl.searchParams.get('offset') ?? '0', 10)
    const q      = request.nextUrl.searchParams.get('q')?.trim() ?? ''

    let query = db
      .from('price_list_version_items')
      .select('id, part_number, unit_price, currency, notes, sku_id, skus(part_number, name)', { count: 'exact' })
      .eq('price_list_version_id', params.id)
      .order('part_number', { ascending: true })
      .range(offset, offset + limit - 1)

    if (q) query = query.ilike('part_number', `%${q}%`)

    const [{ data, error, count }, nullSkuRes] = await Promise.all([
      query,
      db.from('price_list_version_items')
        .select('id', { count: 'exact', head: true })
        .eq('price_list_version_id', params.id)
        .is('sku_id', null),
    ])

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      data:         data ?? [],
      total:        count ?? 0,
      nullSkuCount: nullSkuRes.count ?? 0,
    })
  } catch (err) {
    console.error('[GET /api/price-lists/[id]/items]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
