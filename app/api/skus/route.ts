import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/backend/lib/supabase'
import { listSkus, createSku } from '@/backend/repositories/skuRepository'

const CreateSkuSchema = z.object({
  part_number: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  item_type: z.enum(['purchased_part', 'sub_assembly', 'finished_good', 'service', 'virtual']),
  make_buy: z.enum(['make', 'buy', 'make_or_buy']),
  unit_of_measure: z.string().min(1).max(20),
  family_id: z.string().uuid().nullable().optional(),
  subfamily_id: z.string().uuid().nullable().optional(),
  default_supplier_id: z.string().uuid().nullable().optional(),
  lead_time_days: z.number().int().positive().nullable().optional(),
  is_regulated: z.boolean().default(false),
})

export async function GET(request: NextRequest) {
  try {
    const client = await createServerSupabaseClient()
    const { searchParams } = new URL(request.url)
    const skus = await listSkus({
      status: (searchParams.get('status') as any) ?? 'active',
      family_id: searchParams.get('family_id') ?? undefined,
      subfamily_id: searchParams.get('subfamily_id') ?? undefined,
      search: searchParams.get('q') ?? undefined,
    }, client)
    return NextResponse.json({ data: skus })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch SKUs' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = CreateSkuSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
    }
    const client = await createServerSupabaseClient()
    const sku = await createSku(parsed.data as any, client)
    return NextResponse.json({ data: sku }, { status: 201 })
  } catch (err: any) {
    if (err.code === 'RLS_DENIED') return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    return NextResponse.json({ error: 'Failed to create SKU' }, { status: 500 })
  }
}
