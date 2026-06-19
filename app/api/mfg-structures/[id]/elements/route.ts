import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/backend/lib/supabase'

const ElementSchema = z.object({
  sequence:        z.number().int().positive(),
  elementType:     z.enum(['MATERIAL', 'SUBCONTRACT_PROCESS', 'OVERHEAD', 'MANUAL']),
  processCategory: z.enum(['MACHINING', 'SURFACE_TREATMENT', 'STERILIZATION', 'PACKAGING', 'INSPECTION', 'ASSEMBLY', 'OTHER']).default('OTHER'),
  name:            z.string().min(1).max(200),
  supplierId:      z.string().uuid().optional().nullable(),
  referenceSkuId:  z.string().uuid().optional().nullable(),
  quantity:        z.number().positive().default(1),
  costSource:      z.enum(['FIXED', 'PRICE_LIST', 'LAST_PURCHASE', 'AVERAGE_PURCHASE']),
  fixedCost:       z.number().min(0).optional().nullable(),
  fixedCurrency:   z.string().length(3).toUpperCase().optional().nullable(),
  notes:           z.string().max(1000).optional().nullable(),
}).refine(
  d => d.costSource !== 'FIXED' || (d.fixedCost !== undefined && d.fixedCost !== null && d.fixedCurrency !== undefined && d.fixedCurrency !== null),
  { message: 'Fixed cost and currency are required when costSource is FIXED' }
).refine(
  d => d.costSource === 'FIXED' || (d.referenceSkuId !== undefined && d.referenceSkuId !== null),
  { message: 'referenceSkuId is required for non-FIXED cost sources' }
)

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const roleResult = await (client as any).rpc('auth_has_role', { roles: ['cost_analyst', 'admin'] }).maybeSingle()
    if (!roleResult.data) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

    const orgIdResult = await (client as any).rpc('auth_org_id').maybeSingle()
    const orgId = (orgIdResult.data as string | null) ?? ''

    const body = await request.json()
    const parsed = ElementSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })

    const d = parsed.data
    const svc = createServiceSupabaseClient() as any

    const { data, error } = await svc
      .from('mfg_cost_elements')
      .insert({
        organization_id:  orgId,
        structure_id:     params.id,
        sequence:         d.sequence,
        element_type:     d.elementType,
        process_category: d.processCategory,
        name:             d.name,
        supplier_id:      d.supplierId ?? null,
        reference_sku_id: d.referenceSkuId ?? null,
        quantity:         d.quantity,
        cost_source:      d.costSource,
        fixed_cost:       d.fixedCost ?? null,
        fixed_currency:   d.fixedCurrency ?? null,
        notes:            d.notes ?? null,
      })
      .select('*, suppliers(id, name, code), skus:reference_sku_id(id, part_number, name)')
      .single()

    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: `Sequence ${d.sequence} already exists in this structure` }, { status: 409 })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/mfg-structures/[id]/elements]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
