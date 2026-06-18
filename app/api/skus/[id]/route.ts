import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/backend/lib/supabase'
import { findSkuById, updateSku, archiveSku, findSkuReferences } from '@/backend/repositories/skuRepository'
import { DbError } from '@/backend/repositories/base/errors'

const UpdateSkuSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  item_type: z.enum(['purchased_part', 'sub_assembly', 'finished_good', 'service', 'virtual']).optional(),
  make_buy: z.enum(['make', 'buy', 'make_or_buy']).optional(),
  unit_of_measure: z.string().min(1).max(20).optional(),
  family_id: z.string().uuid().nullable().optional(),
  subfamily_id: z.string().uuid().nullable().optional(),
  default_supplier_id: z.string().uuid().nullable().optional(),
  lead_time_days: z.number().int().positive().nullable().optional(),
  is_regulated: z.boolean().optional(),
  status: z.enum(['draft', 'active', 'discontinued', 'archived']).optional(),
  notes: z.string().nullable().optional(),
})

type RouteParams = { params: { id: string } }

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const client = await createServerSupabaseClient()
    const sku = await findSkuById(params.id, client)
    return NextResponse.json({ data: sku })
  } catch (err) {
    if (err instanceof DbError && err.code === 'NOT_FOUND') {
      return NextResponse.json({ error: 'SKU not found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Failed to fetch SKU' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const body = await request.json()
    const parsed = UpdateSkuSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
    }
    const client = await createServerSupabaseClient()
    const sku = await updateSku(params.id, parsed.data, client)
    return NextResponse.json({ data: sku })
  } catch (err) {
    if (err instanceof DbError && err.code === 'NOT_FOUND') {
      return NextResponse.json({ error: 'SKU not found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Failed to update SKU' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const client = await createServerSupabaseClient()
    // Check for references before archiving (OQ-06)
    const refs = await findSkuReferences(params.id, client)
    if (refs.activeBomLines > 0) {
      return NextResponse.json({
        error: 'SKU is referenced in BOM lines. Archive blocked.',
        references: refs,
      }, { status: 409 })
    }
    const sku = await archiveSku(params.id, client)
    return NextResponse.json({ data: sku })
  } catch (err) {
    if (err instanceof DbError && err.code === 'NOT_FOUND') {
      return NextResponse.json({ error: 'SKU not found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Failed to archive SKU' }, { status: 500 })
  }
}
