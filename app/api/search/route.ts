import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/backend/lib/supabase'

// GET /api/search?q=term&types=sku,bom,supplier,price_list,cost_build,snapshot,report
// Returns up to 5 results per type with deep-link href.
export async function GET(request: NextRequest) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const q = request.nextUrl.searchParams.get('q')?.trim() ?? ''
    if (q.length < 2) return NextResponse.json({ data: [] })

    const db      = client as any
    const pattern = `%${q}%`
    const results: Array<{ type: string; id: string; label: string; sub: string; href: string }> = []

    const [skus, suppliers, builds, snapshots] = await Promise.all([
      // SKUs
      db.from('skus')
        .select('id, part_number, name, item_type, status')
        .or(`part_number.ilike.${pattern},name.ilike.${pattern}`)
        .eq('status', 'active')
        .limit(5),

      // Suppliers
      db.from('suppliers')
        .select('id, name, country, status')
        .ilike('name', pattern)
        .eq('status', 'active')
        .limit(5),

      // Cost Builds
      db.from('site_cost_builds')
        .select('id, name, status, sites(name)')
        .ilike('name', pattern)
        .not('status', 'eq', 'archived')
        .limit(5),

      // Inventory Snapshots
      db.from('inventory_snapshots')
        .select('id, snapshot_name, snapshot_date, status')
        .ilike('snapshot_name', pattern)
        .limit(5),
    ])

    // SKUs
    for (const s of skus.data ?? []) {
      results.push({
        type:  'SKU',
        id:    s.id,
        label: `${s.part_number} — ${s.name}`,
        sub:   s.item_type?.replace(/_/g, ' ') ?? '',
        href:  `/skus?q=${encodeURIComponent(s.part_number)}`,
      })
    }

    // Suppliers
    for (const s of suppliers.data ?? []) {
      results.push({
        type:  'Supplier',
        id:    s.id,
        label: s.name,
        sub:   s.country ?? '',
        href:  `/suppliers?q=${encodeURIComponent(s.name)}`,
      })
    }

    // Cost Builds
    for (const b of builds.data ?? []) {
      results.push({
        type:  'Cost Build',
        id:    b.id,
        label: b.name,
        sub:   `${(b.sites as any)?.name ?? ''} · ${b.status}`,
        href:  `/cost-builds`,
      })
    }

    // Snapshots
    for (const s of snapshots.data ?? []) {
      results.push({
        type:  'Snapshot',
        id:    s.id,
        label: s.snapshot_name,
        sub:   `${s.snapshot_date} · ${s.status}`,
        href:  `/inventory`,
      })
    }

    // Price Lists — search by country code or name
    const priceLists = await db
      .from('country_price_lists')
      .select('id, country_code, name')
      .or(`name.ilike.${pattern},country_code.ilike.${pattern}`)
      .eq('is_active', true)
      .limit(5)

    for (const pl of priceLists.data ?? []) {
      results.push({
        type:  'Price List',
        id:    pl.id,
        label: pl.name,
        sub:   pl.country_code,
        href:  `/price-lists`,
      })
    }

    return NextResponse.json({ data: results })
  } catch (err) {
    console.error('[GET /api/search]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
