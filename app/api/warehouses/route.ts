import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/backend/lib/supabase'

const CreateSchema = z.object({
  site_id:        z.string().uuid(),
  code:           z.string().min(1).max(50).toUpperCase(),
  name:           z.string().min(1).max(200),
  warehouse_type: z.enum(['raw_materials', 'work_in_progress', 'finished_goods', 'quarantine', 'consignment']),
})

export async function GET(request: NextRequest) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const siteId = request.nextUrl.searchParams.get('site_id')
    let q = (client as any)
      .from('warehouses')
      .select('id, code, name, warehouse_type, site_id, is_active, created_at, sites(id, code, name, country)')
      .order('name')

    if (siteId) q = q.eq('site_id', siteId)

    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: data ?? [] })
  } catch (err) {
    console.error('[GET /api/warehouses]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const parsed = CreateSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })

    const orgIdResult = await (client as any).rpc('auth_org_id').maybeSingle()
    const orgId = (orgIdResult.data as string | null) ?? ''
    if (!orgId) return NextResponse.json({ error: 'No organization found' }, { status: 403 })

    const svc   = createServiceSupabaseClient()
    const svcDb = svc as any

    const { data, error } = await svcDb
      .from('warehouses')
      .insert({
        organization_id: orgId,
        site_id:         parsed.data.site_id,
        code:            parsed.data.code,
        name:            parsed.data.name,
        warehouse_type:  parsed.data.warehouse_type,
        is_active:       true,
        created_by:      user.id,
        updated_by:      user.id,
      })
      .select('id, code, name, warehouse_type, site_id, is_active, created_at')
      .single()

    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'A warehouse with this code already exists at this site' }, { status: 409 })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    await svcDb.from('audit_log').insert({
      organization_id: orgId,
      event_type:      'warehouse_created',
      event_category:  'data',
      table_name:      'warehouses',
      record_id:       data.id,
      performed_by:    user.id,
      new_values:      parsed.data,
    })

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/warehouses]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
