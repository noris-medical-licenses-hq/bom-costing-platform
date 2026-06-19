import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/backend/lib/supabase'

const UpdateSchema = z.object({
  rate:        z.number().positive().optional(),
  source_label: z.string().optional(),
})

type RouteParams = { params: { id: string } }

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const roleResult = await (client as any).rpc('auth_user_role').maybeSingle()
    const callerRole = (roleResult.data as string | null) ?? ''
    if (!['cost_analyst', 'approver', 'admin'].includes(callerRole)) {
      return NextResponse.json({ error: 'cost_analyst, approver, or admin role required' }, { status: 403 })
    }

    const orgIdResult = await (client as any).rpc('auth_org_id').maybeSingle()
    const orgId = (orgIdResult.data as string | null) ?? ''

    const body = await request.json()
    const parsed = UpdateSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })

    const svc = createServiceSupabaseClient()
    const svcDb = svc as any

    const { data, error } = await svcDb
      .from('corporate_exchange_rates')
      .update(parsed.data)
      .eq('id', params.id)
      .eq('organization_id', orgId)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: error.code === 'PGRST116' ? 404 : 500 })
    return NextResponse.json({ data })
  } catch (err) {
    console.error('[PATCH /api/corporate-fx/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const roleResult = await (client as any).rpc('auth_user_role').maybeSingle()
    const callerRole = (roleResult.data as string | null) ?? ''
    if (!['cost_analyst', 'approver', 'admin'].includes(callerRole)) {
      return NextResponse.json({ error: 'cost_analyst, approver, or admin role required' }, { status: 403 })
    }

    const orgIdResult = await (client as any).rpc('auth_org_id').maybeSingle()
    const orgId = (orgIdResult.data as string | null) ?? ''

    const svc   = createServiceSupabaseClient()
    const svcDb = svc as any

    // Load before delete for audit
    const { data: existing } = await svcDb.from('corporate_exchange_rates').select('*').eq('id', params.id).single()

    const { error } = await svcDb.from('corporate_exchange_rates').delete().eq('id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await svcDb.from('audit_log').insert({
      organization_id: orgId,
      event_type:      'data_delete',
      event_category:  'data',
      table_name:      'corporate_exchange_rates',
      record_id:       params.id,
      performed_by:    user.id,
      old_values:      existing ?? {},
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/corporate-fx/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
