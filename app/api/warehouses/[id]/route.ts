import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/backend/lib/supabase'

const UpdateSchema = z.object({
  name:           z.string().min(1).max(200).optional(),
  warehouse_type: z.enum(['raw_materials', 'work_in_progress', 'finished_goods', 'quarantine', 'consignment']).optional(),
  is_active:      z.boolean().optional(),
})

type RouteParams = { params: { id: string } }

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await (client as any)
      .from('warehouses')
      .select('id, code, name, warehouse_type, site_id, is_active, created_at, updated_at, sites(id, code, name)')
      .eq('id', params.id)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: error.code === 'PGRST116' ? 404 : 500 })
    return NextResponse.json({ data })
  } catch (err) {
    console.error('[GET /api/warehouses/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const parsed = UpdateSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })

    const orgIdResult = await (client as any).rpc('auth_org_id').maybeSingle()
    const orgId = (orgIdResult.data as string | null) ?? ''

    const svc = createServiceSupabaseClient()
    const svcDb = svc as any

    const { data, error } = await svcDb
      .from('warehouses')
      .update({ ...parsed.data, updated_by: user.id })
      .eq('id', params.id)
      .select('id, code, name, warehouse_type, site_id, is_active')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: error.code === 'PGRST116' ? 404 : 500 })

    const isArchive  = parsed.data.is_active === false
    const isRestore  = parsed.data.is_active === true
    const eventType  = isArchive ? 'warehouse_archived' : isRestore ? 'warehouse_restored' : 'warehouse_updated'

    await svcDb.from('audit_log').insert({
      organization_id: orgId,
      event_type:      eventType,
      event_category:  'data',
      table_name:      'warehouses',
      record_id:       params.id,
      performed_by:    user.id,
      new_values:      parsed.data,
    })

    return NextResponse.json({ data })
  } catch (err) {
    console.error('[PATCH /api/warehouses/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
