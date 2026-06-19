import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/backend/lib/supabase'

const Schema = z.object({ reason: z.string().min(1).max(500).optional() })

type RouteParams = { params: { id: string } }

// POST /api/boms/versions/[id]/reject
// Transitions a BOM version from draft/under_review → archived (rejected).
export async function POST(request: NextRequest, { params }: RouteParams) {
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

    const body   = await request.json().catch(() => ({}))
    const parsed = Schema.safeParse(body)
    const reason = parsed.success ? (parsed.data.reason ?? null) : null

    const svc   = createServiceSupabaseClient()
    const svcDb = svc as any

    const { data: version, error: loadErr } = await svcDb
      .from('bom_versions')
      .select('id, bom_id, status, version_number')
      .eq('id', params.id)
      .single()

    if (loadErr || !version) return NextResponse.json({ error: 'BOM version not found' }, { status: 404 })
    if (version.status === 'approved') {
      return NextResponse.json({ error: 'Cannot reject an already approved version. Archive it instead.' }, { status: 400 })
    }

    const { data: rejected, error: rejectErr } = await svcDb
      .from('bom_versions')
      .update({
        status:         'archived',
        change_summary: reason ? `Rejected: ${reason}` : 'Rejected',
        updated_by:     user.id,
      })
      .eq('id', params.id)
      .select()
      .single()

    if (rejectErr) return NextResponse.json({ error: rejectErr.message }, { status: 500 })

    await svcDb.from('audit_log').insert({
      organization_id: orgId,
      event_type:      'bom_rejected',
      event_category:  'data',
      table_name:      'bom_versions',
      record_id:       params.id,
      performed_by:    user.id,
      new_values: { bom_id: version.bom_id, version_number: version.version_number, reason },
    })

    return NextResponse.json({ data: rejected })
  } catch (err) {
    console.error('[POST /api/boms/versions/[id]/reject]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
