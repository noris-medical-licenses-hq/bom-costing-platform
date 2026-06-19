import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/backend/lib/supabase'

// GET /api/price-lists?countryCode=DE
// Returns country price lists and their versions for a given country code.
// Used by the Cost Build create form to let users pick a specific version.
export async function GET(request: NextRequest) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const db          = client as any
    const countryCode = request.nextUrl.searchParams.get('countryCode')

    let q = db
      .from('country_price_lists')
      .select(`
        id, country_code, name, description, is_active, created_at,
        price_list_versions(id, version_number, effective_date, currency, status, item_count, imported_at)
      `)
      .eq('is_active', true)
      .order('name', { ascending: true })

    if (countryCode) q = q.eq('country_code', countryCode.toUpperCase())

    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Sort versions inside each price list: newest effective_date first
    const result = (data ?? []).map((pl: any) => ({
      ...pl,
      price_list_versions: (pl.price_list_versions ?? []).sort(
        (a: any, b: any) => new Date(b.effective_date).getTime() - new Date(a.effective_date).getTime()
      ),
    }))

    return NextResponse.json({ data: result })
  } catch (err) {
    console.error('[GET /api/price-lists]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
