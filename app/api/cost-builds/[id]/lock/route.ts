import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/backend/lib/supabase'

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const svc   = createServiceSupabaseClient()
    const svcDb = svc as any

    const { data: build, error: fetchErr } = await svcDb
      .from('site_cost_builds')
      .select('id, status, organization_id, cost_set_id')
      .eq('id', params.id)
      .single()

    if (fetchErr || !build) return NextResponse.json({ error: 'Build not found' }, { status: 404 })

    if (build.status !== 'approved') {
      return NextResponse.json(
        { error: `Only approved builds can be locked (current status: ${build.status})` },
        { status: 409 }
      )
    }

    const now = new Date().toISOString()

    const { data: updated, error: updateErr } = await svcDb
      .from('site_cost_builds')
      .update({
        status:    'locked',
        locked_at: now,
        locked_by: user.id,
      })
      .eq('id', params.id)
      .select('id, name, status, locked_at')
      .single()

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    // Also freeze the cost_set so it can no longer be modified
    if (build.cost_set_id) {
      await svcDb.from('cost_sets')
        .update({ is_frozen: true, status: 'locked' })
        .eq('id', build.cost_set_id)
        .catch(() => {})
    }

    await svcDb.from('audit_log').insert({
      organization_id: build.organization_id,
      event_type:      'cost_build_locked',
      event_category:  'data',
      table_name:      'site_cost_builds',
      record_id:       params.id,
      performed_by:    user.id,
      new_values:      { status: 'locked', locked_at: now },
    }).catch(() => {})

    return NextResponse.json({ data: updated })
  } catch (err) {
    console.error('[POST /api/cost-builds/[id]/lock]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
