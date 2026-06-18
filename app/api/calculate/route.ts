import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/backend/lib/supabase'
import { calculateCost } from '@/backend/services/costEngine'

const CalculateSchema = z.object({
  bom_id: z.string().uuid('bom_id must be a valid UUID'),
  cost_set_id: z.string().uuid('cost_set_id must be a valid UUID'),
  valuation_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'valuation_date must be YYYY-MM-DD').optional(),
  trace_level: z.enum(['summary', 'detailed', 'full']).default('detailed'),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Request body must be JSON' }, { status: 400 })
    }
    const parsed = CalculateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
    }
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const result = await calculateCost({
      bomId: parsed.data.bom_id,
      costSetId: parsed.data.cost_set_id,
      valuationDate: parsed.data.valuation_date,
      traceLevel: parsed.data.trace_level,
    }, client)
    return NextResponse.json({ data: result })
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    if (message.includes('Validation errors block calculation')) {
      return NextResponse.json({ error: message }, { status: 422 })
    }
    if (message.includes('No approved BOM version')) {
      return NextResponse.json({ error: message }, { status: 404 })
    }
    if (message.includes('cycle')) {
      return NextResponse.json({ error: message }, { status: 422 })
    }
    return NextResponse.json({ error: 'Cost calculation failed' }, { status: 500 })
  }
}
