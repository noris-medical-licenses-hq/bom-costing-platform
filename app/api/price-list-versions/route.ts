/**
 * GET /api/price-list-versions
 * Returns a flat list of all price list versions for the org.
 * Used by the Impact Analysis selector.
 */
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/backend/lib/supabase'

export async function GET() {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const db = client as any
    const { data, error } = await db
      .from('price_list_versions')
      .select('id, version_number, effective_date, currency, status, country_price_lists(name, country_code)')
      .in('status', ['active', 'superseded'])
      .order('effective_date', { ascending: false })
      .limit(200)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const result = (data ?? []).map((v: any) => ({
      id:              v.id,
      version_number:  v.version_number,
      effective_date:  v.effective_date,
      currency:        v.currency,
      status:          v.status,
      price_list_name: v.country_price_lists?.name ?? '',
      country_code:    v.country_price_lists?.country_code ?? '',
    }))

    return NextResponse.json({ data: result })
  } catch (err) {
    console.error('[GET /api/price-list-versions]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
