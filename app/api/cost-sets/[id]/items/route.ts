import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/backend/lib/supabase'
import { listCostItems, createCostItem } from '@/backend/repositories/costRepository'

const CreateCostItemSchema = z.object({
  item_type: z.enum(['material_price', 'labor_rate', 'overhead_pct', 'freight_pct', 'duty_rate', 'tooling_fixed', 'scrap_rate', 'custom']),
  scope_type: z.enum(['global', 'family', 'subfamily', 'sku', 'supplier', 'supplier_country', 'virtual_component']),
  scope_id: z.string().uuid().optional(),
  scope_code: z.string().optional(),
  value: z.number().min(0),
  value_unit: z.enum(['currency', 'percentage', 'rate_per_hour', 'rate_per_unit']),
  currency: z.string().length(3).optional(),
  effective_from: z.string().optional(),
  effective_to: z.string().optional(),
  notes: z.string().optional(),
})

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const client = await createServerSupabaseClient()
    const items = await listCostItems(params.id, client)
    return NextResponse.json({ data: items })
  } catch (err) {
    console.error('[GET /api/cost-sets/[id]/items]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const parsed = CreateCostItemSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 })
    }

    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await client.from('profiles').select('organization_id, role').eq('user_id', user.id).single()
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
    if (!['cost_analyst', 'approver', 'admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const item = await createCostItem({
      organization_id: profile.organization_id,
      cost_set_id: params.id,
      ...parsed.data,
      scope_id: parsed.data.scope_id ?? null,
      scope_code: parsed.data.scope_code ?? null,
      currency: parsed.data.currency ?? null,
      effective_from: parsed.data.effective_from ?? null,
      effective_to: parsed.data.effective_to ?? null,
      notes: parsed.data.notes ?? null,
      created_by: user.id,
      updated_by: user.id,
    }, client)

    return NextResponse.json({ data: item }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/cost-sets/[id]/items]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
