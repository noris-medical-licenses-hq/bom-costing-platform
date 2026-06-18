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
    await createProfile({
      user_id: payload.record.id,
      organization_id: defaultOrgId,
      email: payload.record.email,
      full_name: (payload.record.user_metadata?.full_name as string) ?? null,
      role: 'viewer',
      is_active: true,
    }, serviceClient)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[auth/webhook] Failed to create profile:', err)
    // Return 500 so Supabase retries the webhook
    return new NextResponse('Internal server error', { status: 500 })
  }
}
