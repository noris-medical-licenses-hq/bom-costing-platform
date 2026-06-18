import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/backend/lib/supabase'
import { listCostSets, createCostSet } from '@/backend/repositories/costRepository'

const CreateCostSetSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  cost_set_type: z.enum(['standard', 'budget', 'quote', 'actual', 'simulation']),
  base_currency: z.string().length(3),
  effective_from: z.string().optional(),
  effective_to: z.string().optional(),
  is_default: z.boolean().optional().default(false),
})

export async function GET() {
  try {
    const client = await createServerSupabaseClient()
    const costSets = await listCostSets(client)
    return NextResponse.json({ data: costSets })
  } catch (err) {
    console.error('[GET /api/cost-sets]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = CreateCostSetSchema.safeParse(body)
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

    const costSet = await createCostSet({
      organization_id: profile.organization_id,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      cost_set_type: parsed.data.cost_set_type,
      base_currency: parsed.data.base_currency,
      effective_from: parsed.data.effective_from ?? null,
      effective_to: parsed.data.effective_to ?? null,
      is_default: parsed.data.is_default,
      is_locked: false,
      status: 'draft',
      created_by: user.id,
      updated_by: user.id,
    }, client)

    return NextResponse.json({ data: costSet }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/cost-sets]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
