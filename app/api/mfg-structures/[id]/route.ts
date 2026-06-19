import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/backend/lib/supabase'

const PatchSchema = z.object({
  name:          z.string().min(1).max(200).optional(),
  mode:          z.enum(['BOM_PLUS_PROCESS', 'PROCESS_ONLY']).optional(),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes:         z.string().max(1000).optional().nullable(),
})

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const db = client as any
    const { data, error } = await db
      .from('manufacturing_cost_structures')
      .select(`
        *,
        skus(id, part_number, name, item_type, item_cost_type),
        mfg_cost_elements(
          id, sequence, element_type, process_category, name,
          supplier_id, reference_sku_id, quantity, cost_source,
          fixed_cost, fixed_currency, notes, created_at, updated_at,
          suppliers(id, name, code),
          skus:reference_sku_id(id, part_number, name)
        )
      `)
      .eq('id', params.id)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: error.code === 'PGRST116' ? 404 : 500 })
    return NextResponse.json({ data })
  } catch (err) {
    console.error('[GET /api/mfg-structures/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const roleResult = await (client as any).rpc('auth_has_role', { roles: ['cost_analyst', 'admin'] }).maybeSingle()
    if (!roleResult.data) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

    const body = await request.json()
    const parsed = PatchSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })

    const updates: Record<string, unknown> = { updated_by: user.id, updated_at: new Date().toISOString() }
    if (parsed.data.name !== undefined)          updates.name           = parsed.data.name
    if (parsed.data.mode !== undefined)          updates.mode           = parsed.data.mode
    if (parsed.data.effectiveDate !== undefined) updates.effective_date = parsed.data.effectiveDate
    if ('notes' in parsed.data)                  updates.notes          = parsed.data.notes ?? null

    const svc = createServiceSupabaseClient() as any
    const { data, error } = await svc
      .from('manufacturing_cost_structures')
      .update(updates)
      .eq('id', params.id)
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await svc.from('audit_log').insert({
      organization_id: data.organization_id,
      actor_id:        user.id,
      event_type:      'mfg_structure_updated',
      event_category:  'data',
      resource_type:   'manufacturing_cost_structures',
      resource_id:     data.id,
      metadata:        updates,
    })

    return NextResponse.json({ data })
  } catch (err) {
    console.error('[PATCH /api/mfg-structures/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
