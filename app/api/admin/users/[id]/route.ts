import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/backend/lib/supabase'

const UpdateSchema = z.object({
  role:      z.enum(['viewer', 'editor', 'cost_analyst', 'procurement', 'approver', 'admin']).optional(),
  is_active: z.boolean().optional(),
})

type RouteParams = { params: { id: string } }

// PATCH /api/admin/users/[id] — change role or deactivate/reactivate (admin only)
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const roleResult = await (client as any).rpc('auth_user_role').maybeSingle()
    const callerRole = (roleResult.data as string | null) ?? ''
    if (callerRole !== 'admin') return NextResponse.json({ error: 'Admin role required' }, { status: 403 })

    const body = await request.json()
    const parsed = UpdateSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })

    // Safety: prevent admin from modifying their own admin status
    if (params.id === user.id && parsed.data.role !== undefined && parsed.data.role !== 'admin') {
      return NextResponse.json({ error: 'Cannot change your own admin role' }, { status: 400 })
    }
    if (params.id === user.id && parsed.data.is_active === false) {
      return NextResponse.json({ error: 'Cannot deactivate your own account' }, { status: 400 })
    }

    const orgIdResult = await (client as any).rpc('auth_org_id').maybeSingle()
    const orgId = (orgIdResult.data as string | null) ?? ''

    const svc = createServiceSupabaseClient()
    const svcDb = svc as any

    // Load the current profile to diff for audit log
    const { data: current } = await svcDb
      .from('profiles')
      .select('id, role, is_active, email, full_name')
      .eq('id', params.id)
      .single()

    if (!current) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const updates: Record<string, unknown> = {}
    if (parsed.data.role      !== undefined) updates.role      = parsed.data.role
    if (parsed.data.is_active !== undefined) updates.is_active = parsed.data.is_active

    const { data: updated, error } = await svcDb
      .from('profiles')
      .update(updates)
      .eq('id', params.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Determine audit event type
    let eventType = 'data_update'
    if (parsed.data.role !== undefined && parsed.data.role !== current.role) eventType = 'user_role_changed'
    else if (parsed.data.is_active === false && current.is_active) eventType = 'user_deactivated'
    else if (parsed.data.is_active === true && !current.is_active) eventType = 'user_reactivated'

    await svcDb.from('audit_log').insert({
      organization_id: orgId,
      event_type:      eventType,
      event_category:  'security',
      table_name:      'profiles',
      record_id:       params.id,
      performed_by:    user.id,
      old_values: { role: current.role, is_active: current.is_active },
      new_values: updates,
    })

    return NextResponse.json({ data: updated })
  } catch (err) {
    console.error('[PATCH /api/admin/users/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
