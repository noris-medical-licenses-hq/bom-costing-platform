import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/backend/lib/supabase'
import { listInventoryLines, upsertInventoryLines } from '@/backend/repositories/inventoryRepository'

const InventoryLineSchema = z.object({
  sku_id: z.string().uuid(),
  warehouse_id: z.string().uuid(),
  quantity: z.number().positive(),
  currency: z.string().length(3),
  unit_cost: z.number().nonnegative().nullable().optional(),
  bom_version_id: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
})

type RouteParams = { params: { id: string } }

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const limit = parseInt(req.nextUrl.searchParams.get('limit') ?? '500', 10)
    const db = client as any

    const { data, error } = await db
      .from('inventory_lines')
      .select(`
        id, sku_id, warehouse_id, quantity, unit_cost, notes,
        skus(part_number, name, sku_type, item_cost_type),
        warehouses(code, name)
      `)
      .eq('snapshot_id', params.id)
      .order('skus(part_number)')
      .limit(limit)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: data ?? [] })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch inventory lines' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const body = await request.json()
    const parsed = z.array(InventoryLineSchema).safeParse(body.lines)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
    }
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const orgIdResult = await client.rpc('auth_org_id').maybeSingle()
    const orgId = (orgIdResult.data as string | null) ?? ''

    const lines = await upsertInventoryLines(
      parsed.data.map(l => ({
        ...l,
        organization_id: orgId,
        snapshot_id: params.id,
        unit_cost: l.unit_cost ?? null,
        bom_version_id: l.bom_version_id ?? null,
        notes: l.notes ?? null,
        has_missing_cost: l.unit_cost == null,
        created_by: user.id,
        updated_by: user.id,
      })),
      client
    )

    return NextResponse.json({ data: lines })
  } catch {
    return NextResponse.json({ error: 'Failed to upsert inventory lines' }, { status: 500 })
  }
}
