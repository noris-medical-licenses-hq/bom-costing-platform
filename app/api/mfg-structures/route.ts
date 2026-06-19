import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/backend/lib/supabase'

const CreateSchema = z.object({
  skuId:         z.string().uuid(),
  name:          z.string().min(1).max(200),
  mode:          z.enum(['BOM_PLUS_PROCESS', 'PROCESS_ONLY']),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  notes:         z.string().max(1000).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const skuId      = searchParams.get('skuId')
    const activeOnly = searchParams.get('activeOnly') !== 'false'

    const db = client as any
    let q = db
      .from('manufacturing_cost_structures')
      .select(`
        id, sku_id, version_number, effective_date, name, mode, is_active, notes,
        created_at, updated_at,
        skus(id, part_number, name, item_type, item_cost_type)
      `)
      .order('sku_id')
      .order('version_number', { ascending: false })

    if (skuId) q = q.eq('sku_id', skuId)
    if (activeOnly) q = q.eq('is_active', true)

    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: data ?? [] })
  } catch (err) {
    console.error('[GET /api/mfg-structures]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const orgIdResult = await (client as any).rpc('auth_org_id').maybeSingle()
    const orgId = (orgIdResult.data as string | null) ?? ''
    if (!orgId) return NextResponse.json({ error: 'No organization found' }, { status: 403 })

    const roleResult = await (client as any).rpc('auth_has_role', { roles: ['cost_analyst', 'admin'] }).maybeSingle()
    if (!roleResult.data) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

    const body = await request.json()
    const parsed = CreateSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })

    const { skuId, name, mode, effectiveDate, notes } = parsed.data

    const svc = createServiceSupabaseClient() as any

    // Determine next version_number for this SKU
    const { data: existing } = await svc
      .from('manufacturing_cost_structures')
      .select('version_number')
      .eq('organization_id', orgId)
      .eq('sku_id', skuId)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle()

    const nextVersion = existing ? (existing.version_number + 1) : 1

    const { data, error } = await svc
      .from('manufacturing_cost_structures')
      .insert({
        organization_id: orgId,
        sku_id:          skuId,
        version_number:  nextVersion,
        effective_date:  effectiveDate,
        name,
        mode,
        is_active:       false,
        notes:           notes ?? null,
        created_by:      user.id,
        updated_by:      user.id,
      })
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await svc.from('audit_log').insert({
      organization_id: orgId,
      actor_id:        user.id,
      event_type:      'mfg_structure_created',
      event_category:  'data',
      resource_type:   'manufacturing_cost_structures',
      resource_id:     data.id,
      metadata:        { sku_id: skuId, mode, version: nextVersion },
    })

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/mfg-structures]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
