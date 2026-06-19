import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/backend/lib/supabase'

// Only operational strategies may be used to create builds.
const CreateSchema = z.object({
  siteId:              z.string().uuid(),
  name:                z.string().min(1).max(200),
  description:         z.string().max(500).optional(),
  defaultStrategy:     z.enum(['PRICE_LIST', 'BOM_ROLLUP']),
  priceListVersionId:  z.string().uuid().optional(),  // pin a specific version; else auto-detects latest
  notes:               z.string().max(500).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const db = client as any
    const siteId = request.nextUrl.searchParams.get('siteId')
    const status = request.nextUrl.searchParams.get('status')

    let q = db
      .from('site_cost_builds')
      .select(`
        id, name, description, default_strategy, status,
        line_count, error_count, built_at, created_at, notes,
        sites(id, name, code),
        cost_sets(id, name, base_currency, is_frozen)
      `)
      .order('created_at', { ascending: false })
      .limit(100)

    if (siteId) q = q.eq('site_id', siteId)
    if (status)  q = q.eq('status', status)

    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ data: data ?? [] })
  } catch (err) {
    console.error('[GET /api/cost-builds]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const orgIdResult = await (client as any).rpc('auth_org_id').maybeSingle()
    const orgId = (orgIdResult.data as string | null) ?? ''
    if (!orgId) return NextResponse.json({ error: 'No organization found' }, { status: 403 })

    const body = await request.json()
    const parsed = CreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
    }

    const { siteId, name, description, defaultStrategy, priceListVersionId, notes } = parsed.data

    const svc = createServiceSupabaseClient()
    const svcDb = svc as any

    const { data: build, error } = await svcDb
      .from('site_cost_builds')
      .insert({
        organization_id:      orgId,
        site_id:              siteId,
        name,
        description:          description ?? null,
        default_strategy:     defaultStrategy,
        price_list_version_id: priceListVersionId ?? null,
        notes:                notes ?? null,
        created_by:           user.id,
      })
      .select('id, name, default_strategy, status, created_at')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ data: build }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/cost-builds]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
