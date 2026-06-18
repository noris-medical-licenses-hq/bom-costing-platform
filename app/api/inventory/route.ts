import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/backend/lib/supabase'
import { listSnapshots, createSnapshot } from '@/backend/repositories/inventoryRepository'

const CreateSnapshotSchema = z.object({
  snapshot_name: z.string().min(1).max(255),
  snapshot_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  snapshot_type: z.enum(['full', 'site', 'warehouse', 'project']),
  cost_set_id: z.string().uuid(),
  base_currency: z.string().length(3),
  scope_site_id: z.string().uuid().nullable().optional(),
  scope_warehouse_id: z.string().uuid().nullable().optional(),
  scope_project_id: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const client = await createServerSupabaseClient()
    const { searchParams } = new URL(request.url)
    const snapshots = await listSnapshots({
      status: (searchParams.get('status') as 'draft' | 'under_review' | 'approved' | 'superseded' | 'archived' | null) ?? undefined,
      snapshot_type: (searchParams.get('type') as 'full' | 'site' | 'warehouse' | 'project' | null) ?? undefined,
      from: searchParams.get('from') ?? undefined,
      to: searchParams.get('to') ?? undefined,
    }, client)
    return NextResponse.json({ data: snapshots })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch inventory snapshots' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = CreateSnapshotSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
    }
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const orgIdResult = await client.rpc('auth_org_id').maybeSingle()
    const orgId = (orgIdResult.data as string | null) ?? ''

    const snapshot = await createSnapshot({
      ...parsed.data,
      organization_id: orgId,
      scope_site_id: parsed.data.scope_site_id ?? null,
      scope_warehouse_id: parsed.data.scope_warehouse_id ?? null,
      scope_project_id: parsed.data.scope_project_id ?? null,
      notes: parsed.data.notes ?? null,
      status: 'draft',
      created_by: user.id,
      updated_by: user.id,
    }, client)

    return NextResponse.json({ data: snapshot }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create inventory snapshot' }, { status: 500 })
  }
}
