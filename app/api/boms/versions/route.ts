import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/backend/lib/supabase'

// GET /api/boms/versions?q=<part_number_or_name>&status=<status>
// Returns BOM versions with their parent BOM and SKU info.
// Supports search by SKU part_number or name.
export async function GET(request: NextRequest) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const db     = client as any
    const q      = request.nextUrl.searchParams.get('q')?.trim() ?? ''
    const status = request.nextUrl.searchParams.get('status')

    // Build the query: join bom_versions → boms → skus
    let query = db
      .from('bom_versions')
      .select(`
        id, version_number, version_label, status, is_locked,
        effective_from, change_summary, approved_at, created_at, updated_at,
        approved_by_profile:profiles!bom_versions_approved_by_fkey(full_name, email),
        boms!inner(
          id, sku_id,
          skus!inner(id, part_number, name, item_type)
        )
      `)
      .order('created_at', { ascending: false })
      .limit(200)

    if (status) query = query.eq('status', status)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Filter by part_number / name search (done in JS to avoid complex PostgREST syntax)
    let results = data ?? []
    if (q) {
      const lower = q.toLowerCase()
      results = results.filter((v: any) => {
        const sku = v.boms?.skus
        if (!sku) return false
        return (
          sku.part_number?.toLowerCase().includes(lower) ||
          sku.name?.toLowerCase().includes(lower)
        )
      })
    }

    return NextResponse.json({ data: results })
  } catch (err) {
    console.error('[GET /api/boms/versions]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
