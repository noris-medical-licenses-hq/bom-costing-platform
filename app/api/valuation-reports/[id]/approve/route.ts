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

    const orgIdResult = await client.rpc('auth_org_id').maybeSingle()
    const orgId = (orgIdResult.data as string | null) ?? ''

    const db = client as any
    const { data: report } = await db
      .from('valuation_reports')
      .select('id, status')
      .eq('id', params.id)
      .single()

    if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    if (report.status !== 'complete') {
      return NextResponse.json({ error: `Cannot approve a report with status "${report.status}". Report must be complete first.` }, { status: 409 })
    }

    const svc = createServiceSupabaseClient()
    const svcDb = svc as any

    await svcDb.from('valuation_reports').update({
      status:      'approved',
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      updated_by:  user.id,
      updated_at:  new Date().toISOString(),
    }).eq('id', params.id)

    await svcDb.from('audit_log').insert({
      organization_id: orgId,
      event_type:      'status_change',
      event_category:  'data',
      table_name:      'valuation_reports',
      record_id:       params.id,
      performed_by:    user.id,
      new_values:      { status: 'approved', approved_by: user.id },
      old_values:      { status: 'complete' },
    })

    return NextResponse.json({ data: { id: params.id, status: 'approved' } })
  } catch (err) {
    console.error('[POST /api/valuation-reports/[id]/approve]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
