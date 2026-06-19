import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/backend/lib/supabase'
import { runCostBuild } from '@/backend/services/costBuild'

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const roleResult = await (client as any).rpc('auth_user_role').maybeSingle()
    const callerRole = (roleResult.data as string | null) ?? ''
    if (!['cost_analyst', 'approver', 'admin'].includes(callerRole)) {
      return NextResponse.json({ error: 'cost_analyst, approver, or admin role required' }, { status: 403 })
    }

    const orgIdResult = await (client as any).rpc('auth_org_id').maybeSingle()
    const orgId = (orgIdResult.data as string | null) ?? ''
    if (!orgId) return NextResponse.json({ error: 'No organization found' }, { status: 403 })

    const svc   = createServiceSupabaseClient()
    const svcDb = svc as any

    const result = await runCostBuild(params.id, orgId, user.id, svcDb)

    return NextResponse.json({ data: result })
  } catch (err: any) {
    console.error('[POST /api/cost-builds/[id]/run]', err)
    const msg: string = err?.message ?? 'Build failed'
    const status = msg.includes('not found') ? 404
      : msg.includes('already running') || msg.includes('already complete') ? 409
      : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
