import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '../../../../backend/lib/supabase'

export async function GET() {
  const client = await createServerSupabaseClient()
  const { data: { user }, error } = await client.auth.getUser()
  if (error || !user) return NextResponse.json({ user: null }, { status: 401 })

  const { data: profile } = await client
    .from('profiles')
    .select('full_name, role, organization_id')
    .eq('id', user.id)
    .single()

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      full_name: profile?.full_name ?? null,
      role: profile?.role ?? null,
      organization_id: profile?.organization_id ?? null,
    }
  })
}
