import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/backend/lib/supabase'

const InviteSchema = z.object({
  email:     z.string().email(),
  full_name: z.string().min(1).max(255),
  role:      z.enum(['viewer', 'editor', 'cost_analyst', 'procurement', 'approver', 'admin']),
})

// GET /api/admin/users — list all profiles in the org (admin only)
export async function GET() {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const db = client as any
    const { data, error } = await db
      .from('profiles')
      .select('id, full_name, email, role, is_active, last_seen_at, created_at, invited_by')
      .order('full_name', { ascending: true })

    if (error) {
      if (error.code === '42501') return NextResponse.json({ error: 'Insufficient permissions — admin role required' }, { status: 403 })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: data ?? [] })
  } catch (err) {
    console.error('[GET /api/admin/users]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/admin/users — invite a new user (admin only)
export async function POST(request: NextRequest) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const parsed = InviteSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })

    const { email, full_name, role } = parsed.data

    const orgIdResult = await (client as any).rpc('auth_org_id').maybeSingle()
    const orgId = (orgIdResult.data as string | null) ?? ''
    if (!orgId) return NextResponse.json({ error: 'No organization found' }, { status: 403 })

    const roleResult = await (client as any).rpc('auth_user_role').maybeSingle()
    const callerRole = (roleResult.data as string | null) ?? ''
    if (callerRole !== 'admin') return NextResponse.json({ error: 'Admin role required to invite users' }, { status: 403 })

    const svc = createServiceSupabaseClient()
    const svcDb = svc as any

    // Step 1: Invite via Supabase Auth Admin API — this sends an invitation email
    const { data: inviteData, error: inviteError } = await svc.auth.admin.inviteUserByEmail(email, {
      data: { full_name, invited_role: role },
    })
    if (inviteError) {
      if (inviteError.message?.includes('already registered')) {
        return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 })
      }
      return NextResponse.json({ error: inviteError.message }, { status: 500 })
    }

    const newUserId = inviteData.user?.id
    if (!newUserId) return NextResponse.json({ error: 'Invitation created but no user ID returned' }, { status: 500 })

    // Step 2: Upsert the profile with the correct role (wins over webhook's default 'viewer')
    const { data: profile, error: profileErr } = await svcDb
      .from('profiles')
      .upsert({
        id:              newUserId,
        organization_id: orgId,
        email,
        full_name,
        role,
        is_active:       true,
        invited_by:      user.id,
      }, { onConflict: 'id' })
      .select()
      .single()

    if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 })

    // Step 3: Audit log
    await svcDb.from('audit_log').insert({
      organization_id: orgId,
      event_type:      'user_invited',
      event_category:  'security',
      table_name:      'profiles',
      record_id:       newUserId,
      performed_by:    user.id,
      new_values: { email, full_name, role },
    })

    return NextResponse.json({ data: profile }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/admin/users]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
