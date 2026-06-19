import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/backend/lib/supabase'

type RouteParams = { params: { id: string } }

export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const orgIdResult = await client.rpc('auth_org_id').maybeSingle()
    const orgId = (orgIdResult.data as string | null) ?? ''

    const db = client as any
    const { data: site } = await db.from('sites').select('id, code, name, status, organization_id').eq('id', params.id).single()
    if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 })
    if (site.organization_id !== orgId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (site.status === 'deleted') return NextResponse.json({ error: 'Cannot archive a deleted site' }, { status: 409 })
    if (site.status === 'archived') return NextResponse.json({ error: 'Site is already archived' }, { status: 409 })

    const now = new Date().toISOString()

    await db.from('sites').update({
      status:      'archived',
      is_active:   false,
      archived_at: now,
      archived_by: user.id,
      updated_by:  user.id,
    }).eq('id', params.id)

    await db.from('audit_log').insert({
      organization_id: orgId,
      event_type:      'site_archived',
      event_category:  'admin',
      table_name:      'sites',
      record_id:       params.id,
      performed_by:    user.id,
      performed_at:    now,
      new_values:      { status: 'archived', archived_at: now },
      metadata:        { site_code: site.code, site_name: site.name },
    })

    return NextResponse.json({ success: true, status: 'archived' })
  } catch (err) {
    console.error('[POST /api/sites/[id]/archive]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
