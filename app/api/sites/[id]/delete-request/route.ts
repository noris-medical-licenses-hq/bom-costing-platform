import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/backend/lib/supabase'

type RouteParams = { params: { id: string } }

const Schema = z.object({
  siteCode:     z.string().min(1),
  reason:       z.string().min(3).max(2000),
  reasonCode:   z.enum(['end_of_life', 'restructuring', 'duplicate', 'data_error', 'other']),
})

// POST /api/sites/[id]/delete-request
// Records a deletion intent for an archived site. Does NOT change site status
// (sites.status only allows 'active' | 'archived' per M-032). Records the
// intent in audit_log and stamps pending_delete_at / delete_reason columns
// so the admin team can review before any manual action is taken.
// Hard-blocked if site has cost builds or inventory snapshots.
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const roleResult = await (client as any).rpc('auth_user_role').maybeSingle()
    const callerRole = (roleResult.data as string | null) ?? ''
    if (callerRole !== 'admin') return NextResponse.json({ error: 'Admin role required' }, { status: 403 })

    const orgIdResult = await client.rpc('auth_org_id').maybeSingle()
    const orgId = (orgIdResult.data as string | null) ?? ''

    const body = await request.json()
    const parsed = Schema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })

    const svc   = createServiceSupabaseClient()
    const svcDb = svc as any

    const { data: site } = await svcDb.from('sites')
      .select('id, code, name, status, organization_id')
      .eq('id', params.id)
      .eq('organization_id', orgId)
      .single()

    if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 })
    if (site.status !== 'archived') return NextResponse.json({ error: 'Only archived sites can be requested for deletion' }, { status: 409 })

    if (parsed.data.siteCode.toUpperCase() !== site.code.toUpperCase()) {
      return NextResponse.json({ error: 'Site code does not match — deletion request rejected' }, { status: 422 })
    }

    // Count linked entities — hard-block if historical costing/inventory data exists
    const [wRes, cbRes, isRes] = await Promise.all([
      svcDb.from('warehouses').select('id', { count: 'exact', head: true }).eq('site_id', params.id),
      svcDb.from('site_cost_builds').select('id', { count: 'exact', head: true }).eq('site_id', params.id),
      svcDb.from('inventory_snapshots').select('id', { count: 'exact', head: true }).eq('scope_site_id', params.id),
    ])

    const linkedCounts = {
      warehouses:          wRes.count ?? 0,
      cost_builds:         cbRes.count ?? 0,
      inventory_snapshots: isRes.count ?? 0,
    }

    if (linkedCounts.cost_builds > 0 || linkedCounts.inventory_snapshots > 0) {
      return NextResponse.json({
        error: 'Cannot request deletion: site has historical cost builds or inventory snapshots. Archive only.',
        linkedCounts,
        blocked: true,
      }, { status: 422 })
    }

    const now              = new Date().toISOString()
    const pendingDeleteAt  = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()
    const deleteReason     = `[${parsed.data.reasonCode}] ${parsed.data.reason}`

    // Stamp the deletion intent columns without changing status (status stays 'archived')
    await svcDb.from('sites').update({
      pending_delete_at: pendingDeleteAt,
      delete_reason:     deleteReason,
      updated_by:        user.id,
    }).eq('id', params.id).eq('organization_id', orgId)

    await svcDb.from('audit_log').insert({
      organization_id: orgId,
      event_type:      'site_delete_requested',
      event_category:  'admin',
      table_name:      'sites',
      record_id:       params.id,
      performed_by:    user.id,
      performed_at:    now,
      new_values:      { pending_delete_at: pendingDeleteAt },
      metadata:        {
        site_code:         site.code,
        site_name:         site.name,
        reason_code:       parsed.data.reasonCode,
        reason:            parsed.data.reason,
        linked_counts:     linkedCounts,
        recoverable_until: pendingDeleteAt,
      },
    })

    return NextResponse.json({
      success: true,
      status: 'archived',
      pendingDeleteAt,
      linkedCounts,
    })
  } catch (err) {
    console.error('[POST /api/sites/[id]/delete-request]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
