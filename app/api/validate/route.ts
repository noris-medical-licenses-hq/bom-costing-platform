import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/backend/lib/supabase'
import { runValidationEngine } from '@/backend/services/validationEngine'

const ValidateSchema = z.object({
  scope_type: z.enum(['bom_version', 'sku', 'cost_set', 'inventory_snapshot', 'organization']),
  scope_id: z.string().uuid().nullable(),
  run_type: z.enum(['on_demand', 'pre_calculation', 'pre_approval', 'scheduled']).default('on_demand'),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Request body must be JSON' }, { status: 400 })
    }
    const parsed = ValidateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
    }
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const result = await runValidationEngine(parsed.data, client)
    return NextResponse.json({ data: result })
  } catch {
    return NextResponse.json({ error: 'Validation run failed' }, { status: 500 })
  }
}
