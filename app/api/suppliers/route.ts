import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/backend/lib/supabase'
import { listSuppliers, createSupplier } from '@/backend/repositories/supplierRepository'

const CreateSupplierSchema = z.object({
  name: z.string().min(1).max(255),
  country: z.string().min(2).max(2),
  contact_email: z.string().email().nullable().optional(),
  contact_name: z.string().nullable().optional(),
  status: z.enum(['active', 'inactive', 'disqualified']).default('active'),
  notes: z.string().nullable().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const client = await createServerSupabaseClient()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') as 'active' | 'inactive' | 'disqualified' | null
    const suppliers = await listSuppliers(status ?? 'active', client)
    return NextResponse.json({ data: suppliers })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch suppliers' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = CreateSupplierSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
    }
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const orgIdResult = await client.rpc('auth_org_id').maybeSingle()
    const orgId = (orgIdResult.data as string | null) ?? ''

    const supplier = await createSupplier({
      ...parsed.data,
      organization_id: orgId,
      contact_email: parsed.data.contact_email ?? null,
      contact_name: parsed.data.contact_name ?? null,
      notes: parsed.data.notes ?? null,
      created_by: user.id,
      updated_by: user.id,
    }, client)

    return NextResponse.json({ data: supplier }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create supplier' }, { status: 500 })
  }
}
