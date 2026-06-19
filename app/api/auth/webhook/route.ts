// Supabase Auth webhook — fires when a new auth.users row is created.
// Creates the corresponding profiles row using the service_role client.
// See: docs/AUTH_IMPLEMENTATION_PLAN.md §4
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabaseClient } from '@/backend/lib/supabase'
import { createProfile } from '@/backend/repositories/profileRepository'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const expectedSecret = `Bearer ${process.env.WEBHOOK_SECRET}`
  if (!process.env.WEBHOOK_SECRET || authHeader !== expectedSecret) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  let payload: { type: string; record: { id: string; email: string; user_metadata?: Record<string, unknown> } }
  try {
    payload = await request.json()
  } catch {
    return new NextResponse('Bad Request', { status: 400 })
  }

  if (payload.type !== 'INSERT') {
    return NextResponse.json({ ok: true })
  }

  const defaultOrgId = process.env.DEFAULT_ORGANIZATION_ID
  if (!defaultOrgId) {
    console.error('[auth/webhook] DEFAULT_ORGANIZATION_ID not set — cannot create profile')
    return new NextResponse('Server misconfiguration', { status: 500 })
  }

  try {
    const serviceClient = createServiceSupabaseClient()
    const userId     = payload.record.id
    const email      = payload.record.email
    const fullName   = (payload.record.user_metadata?.full_name as string) ?? email.split('@')[0]
    // invited_role may be pre-set by the admin invite flow; default to 'viewer'
    const invitedRole = (payload.record.user_metadata?.invited_role as string) ?? 'viewer'

    // Upsert: if the admin invite API already created the profile (with correct role),
    // this is a no-op (ignoreDuplicates). If profile doesn't exist yet, create it.
    const { error } = await (serviceClient as any)
      .from('profiles')
      .upsert({
        id:              userId,
        organization_id: defaultOrgId,
        email,
        full_name:       fullName,
        role:            invitedRole,
        is_active:       true,
      }, { onConflict: 'id', ignoreDuplicates: true })

    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[auth/webhook] Failed to upsert profile:', err)
    return new NextResponse('Internal server error', { status: 500 })
  }
}
