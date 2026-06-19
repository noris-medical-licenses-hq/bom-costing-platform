import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/backend/lib/supabase'

type RouteParams = { params: { id: string } }

// POST /api/boms/versions/[id]/approve
// Transitions a BOM version from draft/under_review → approved.
// Supersedes any previously approved version for the same BOM.
export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const roleResult = await (client as any).rpc('auth_user_role').maybeSingle()
    const callerRole = (roleResult.data as string | null) ?? ''
    if (!['approver', 'admin', 'cost_analyst'].includes(callerRole)) {
      return NextResponse.json({ error: 'approver, cost_analyst, or admin role required' }, { status: 403 })
    }

    const orgIdResult = await (client as any).rpc('auth_org_id').maybeSingle()
    const orgId = (orgIdResult.data as string | null) ?? ''

    const svc   = createServiceSupabaseClient()
    const svcDb = svc as any

    // Load version to approve
    const { data: version, error: loadErr } = await svcDb
      .from('bom_versions')
      .select('id, bom_id, status, version_number')
      .eq('id', params.id)
      .single()

    if (loadErr || !version) return NextResponse.json({ error: 'BOM version not found' }, { status: 404 })
    if (!['draft', 'under_review'].includes(version.status)) {
      return NextResponse.json({ error: `Cannot approve a version with status "${version.status}"` }, { status: 400 })
    }

    // Supersede any existing approved version for this BOM
    await svcDb
      .from('bom_versions')
      .update({ status: 'superseded', updated_by: user.id })
      .eq('bom_id', version.bom_id)
      .eq('status', 'approved')

    // Approve this version
    const { data: approved, error: approveErr } = await svcDb
      .from('bom_versions')
      .update({
        status:      'approved',
        is_locked:   true,
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        updated_by:  user.id,
      })
      .eq('id', params.id)
      .select()
      .single()

    if (approveErr) return NextResponse.json({ error: approveErr.message }, { status: 500 })

    await svcDb.from('audit_log').insert({
      organization_id: orgId,
      event_type:      'bom_approved',
      event_category:  'data',
      table_name:      'bom_versions',
      record_id:       params.id,
      performed_by:    user.id,
      new_values: { bom_id: version.bom_id, version_number: version.version_number, status: 'approved' },
    })

    return NextResponse.json({ data: approved })
  } catch (err) {
    console.error('[POST /api/boms/versions/[id]/approve]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
