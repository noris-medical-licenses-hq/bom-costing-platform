import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceSupabaseClient } from '../../../../backend/lib/supabase'

export async function POST() {
  const client = await createServerSupabaseClient()
  const { data: { user } } = await client.auth.getUser()

  if (user) {
    const orgRes = await (client as any).rpc('auth_org_id').maybeSingle()
    const orgId  = orgRes.data as string | null
    if (orgId) {
      const svc = createServiceSupabaseClient() as any
      await svc.from('audit_log').insert({
        organization_id: orgId,
        event_type:      'user_logout',
        event_category:  'admin',
        table_name:      'profiles',
        record_id:       user.id,
        performed_by:    user.id,
        new_values:      { email: user.email },
      })
    }
  }

  await client.auth.signOut()
  return NextResponse.json({ success: true })
}
