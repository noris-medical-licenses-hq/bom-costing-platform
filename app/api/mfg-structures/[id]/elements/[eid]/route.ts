import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/backend/lib/supabase'

const PatchElementSchema = z.object({
  sequence:        z.number().int().positive().optional(),
  elementType:     z.enum(['MATERIAL', 'SUBCONTRACT_PROCESS', 'OVERHEAD', 'MANUAL']).optional(),
  processCategory: z.enum(['MACHINING', 'SURFACE_TREATMENT', 'STERILIZATION', 'PACKAGING', 'INSPECTION', 'ASSEMBLY', 'OTHER']).optional(),
  name:            z.string().min(1).max(200).optional(),
  supplierId:      z.string().uuid().optional().nullable(),
  referenceSkuId:  z.string().uuid().optional().nullable(),
  quantity:        z.number().positive().optional(),
  costSource:      z.enum(['FIXED', 'PRICE_LIST', 'LAST_PURCHASE', 'AVERAGE_PURCHASE']).optional(),
  fixedCost:       z.number().min(0).optional().nullable(),
  fixedCurrency:   z.string().length(3).toUpperCase().optional().nullable(),
  notes:           z.string().max(1000).optional().nullable(),
})

export async function PATCH(request: NextRequest, { params }: { params: { id: string; eid: string } }) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const roleResult = await (client as any).rpc('auth_has_role', { roles: ['cost_analyst', 'admin'] }).maybeSingle()
    if (!roleResult.data) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

    const body = await request.json()
    const parsed = PatchElementSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })

    const d = parsed.data
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (d.sequence        !== undefined) updates.sequence         = d.sequence
    if (d.elementType     !== undefined) updates.element_type     = d.elementType
    if (d.processCategory !== undefined) updates.process_category = d.processCategory
    if (d.name            !== undefined) updates.name             = d.name
    if ('supplierId'      in d)          updates.supplier_id      = d.supplierId ?? null
    if ('referenceSkuId'  in d)          updates.reference_sku_id = d.referenceSkuId ?? null
    if (d.quantity        !== undefined) updates.quantity         = d.quantity
    if (d.costSource      !== undefined) updates.cost_source      = d.costSource
    if ('fixedCost'       in d)          updates.fixed_cost       = d.fixedCost ?? null
    if ('fixedCurrency'   in d)          updates.fixed_currency   = d.fixedCurrency ?? null
    if ('notes'           in d)          updates.notes            = d.notes ?? null

    const svc = createServiceSupabaseClient() as any
    const { data, error } = await svc
      .from('mfg_cost_elements')
      .update(updates)
      .eq('id', params.eid)
      .eq('structure_id', params.id)
      .select('*, suppliers(id, name, code), skus:reference_sku_id(id, part_number, name)')
      .single()

    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'Sequence conflict' }, { status: 409 })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ data })
  } catch (err) {
    console.error('[PATCH /api/mfg-structures/[id]/elements/[eid]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string; eid: string } }) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const roleResult = await (client as any).rpc('auth_has_role', { roles: ['cost_analyst', 'admin'] }).maybeSingle()
    if (!roleResult.data) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

    const svc = createServiceSupabaseClient() as any
    const { error } = await svc
      .from('mfg_cost_elements')
      .delete()
      .eq('id', params.eid)
      .eq('structure_id', params.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/mfg-structures/[id]/elements/[eid]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
