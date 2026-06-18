import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '../../../../backend/lib/supabase'

export async function POST() {
  const client = await createServerSupabaseClient()
  await client.auth.signOut()
  return NextResponse.json({ success: true })
}
