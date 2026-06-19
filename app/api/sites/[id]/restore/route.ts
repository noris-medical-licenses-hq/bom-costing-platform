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
    const { data: site } = await db.from('sites').select('id, code, name, status, organization_id, pending_delete_at').eq('id', params.id).single()
    if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 })
    if (site.organization_id !== orgId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (site.status === 'active') return NextResponse.json({ error: 'Site is already active' }, { status: 409 })
    if (site.status === 'deleted') return NextResponse.json({ error: 'Permanently deleted sites cannot be restored' }, { status: 409 })

    const now = new Date().toISOString()

    await db.from('sites').update({
      status:            'active',
      is_active:         true,
      archived_at:       null,
      archived_by:       null,
      pending_delete_at: null,
      delete_reason:     null,
      updated_by:        user.id,
    }).eq('id', params.id)

    await db.from('audit_log').insert({
      organization_id: orgId,
      event_type:      'site_restored',
      event_category:  'admin',
      table_name:      'sites',
      record_id:       params.id,
      performed_by:    user.id,
      performed_at:    now,
      old_values:      { status: site.status },
      new_values:      { status: 'active' },
      metadata:        { site_code: site.code, site_name: site.name },
    })

    return NextResponse.json({ success: true, status: 'active' })
  } catch (err) {
    console.error('[POST /api/sites/[id]/restore]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
