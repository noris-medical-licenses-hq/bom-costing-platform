import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/backend/lib/supabase'

const UpdateSchema = z.object({
  name:          z.string().min(1).max(255).optional(),
  country:       z.string().length(2).toUpperCase().optional(),
  contact_email: z.string().email().nullable().optional(),
  contact_name:  z.string().nullable().optional(),
  status:        z.enum(['active', 'inactive', 'disqualified']).optional(),
  notes:         z.string().nullable().optional(),
})

type RouteParams = { params: { id: string } }

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const [supplierRes, skusRes] = await Promise.all([
      (client as any).from('suppliers').select('*').eq('id', params.id).single(),
      (client as any).from('skus')
        .select('id, part_number, name, item_type, status')
        .eq('default_supplier_id', params.id)
        .eq('status', 'active')
        .limit(50),
    ])

    if (supplierRes.error) return NextResponse.json({ error: supplierRes.error.message }, { status: supplierRes.error.code === 'PGRST116' ? 404 : 500 })
    return NextResponse.json({ data: { ...supplierRes.data, linked_skus: skusRes.data ?? [] } })
  } catch (err) {
    console.error('[GET /api/suppliers/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const roleResult = await (client as any).rpc('auth_user_role').maybeSingle()
    const callerRole = (roleResult.data as string | null) ?? ''
    if (!['procurement', 'cost_analyst', 'approver', 'admin'].includes(callerRole)) {
      return NextResponse.json({ error: 'procurement or admin role required' }, { status: 403 })
    }

    const orgIdResult = await (client as any).rpc('auth_org_id').maybeSingle()
    const orgId = (orgIdResult.data as string | null) ?? ''

    const body = await request.json()
    const parsed = UpdateSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })

    const svc = createServiceSupabaseClient()
    const svcDb = svc as any

    const { data, error } = await svcDb
      .from('suppliers')
      .update({ ...parsed.data, updated_by: user.id })
      .eq('id', params.id)
      .eq('organization_id', orgId)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: error.code === 'PGRST116' ? 404 : 500 })
    return NextResponse.json({ data })
  } catch (err) {
    console.error('[PATCH /api/suppliers/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
