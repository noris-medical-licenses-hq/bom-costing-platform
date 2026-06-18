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
    const body = await request.json()
    const parsed = ValidateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
    }
    const client = await createServerSupabaseClient()
    const result = await runValidationEngine(parsed.data, client)
    const statusCode = result.errorCount > 0 ? 200 : 200 // always 200 — findings in body
    return NextResponse.json({ data: result }, { status: statusCode })
  } catch (err) {
    return NextResponse.json({ error: 'Validation run failed' }, { status: 500 })
  }
}
