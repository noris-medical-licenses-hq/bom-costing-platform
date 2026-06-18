import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/backend/lib/supabase'

const CreateSchema = z.object({
  fromCurrency:  z.string().length(3),
  toCurrency:    z.string().length(3),
  rate:          z.number().positive(),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sourceLabel:   z.string().optional(),
})

export async function GET() {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const db = client as any
    const { data, error } = await db
      .from('corporate_exchange_rates')
      .select('id, from_currency, to_currency, rate, effective_date, source_label, created_at')
      .order('effective_date', { ascending: false })
      .order('from_currency')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: data ?? [] })
  } catch (err) {
    console.error('[GET /api/corporate-fx]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const orgIdResult = await client.rpc('auth_org_id').maybeSingle()
    const orgId = (orgIdResult.data as string | null) ?? ''
    if (!orgId) return NextResponse.json({ error: 'No organization found' }, { status: 403 })

    const body = await request.json()
    const parsed = CreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
    }

    const { fromCurrency, toCurrency, rate, effectiveDate, sourceLabel } = parsed.data

    const db = client as any
    const { data, error } = await db.from('corporate_exchange_rates').upsert({
      organization_id: orgId,
      from_currency:   fromCurrency,
      to_currency:     toCurrency,
      rate,
      effective_date:  effectiveDate,
      source_label:    sourceLabel ?? null,
      created_by:      user.id,
    }, { onConflict: 'organization_id,from_currency,to_currency,effective_date' })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/corporate-fx]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
