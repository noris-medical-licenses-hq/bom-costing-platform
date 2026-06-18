import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/backend/lib/supabase'
import { createRuleException } from '@/backend/repositories/ruleRepository'

const CreateExceptionSchema = z.object({
  cost_rule_id: z.string().uuid(),
  exception_scope_type: z.enum(['sku', 'bom_version', 'family', 'subfamily', 'supplier', 'warehouse', 'project']),
  exception_scope_id: z.string().uuid(),
  exception_type: z.enum(['skip_rule', 'override_value', 'override_basis']),
  override_value: z.number().nullable().optional(),
  override_value_currency: z.string().nullable().optional(),
  business_justification: z.string().min(10),
  effective_from: z.string().datetime(),
  effective_to: z.string().datetime().nullable().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const client = await createServerSupabaseClient()
    const { searchParams } = new URL(request.url)
    const ruleId = searchParams.get('rule_id')

    let query = client.from('rule_exceptions').select('*').order('created_at', { ascending: false })
    if (ruleId) query = query.eq('cost_rule_id', ruleId)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: 'Failed to fetch exceptions' }, { status: 500 })
    return NextResponse.json({ data: data ?? [] })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch exceptions' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = CreateExceptionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
    }
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const orgIdResult = await client.rpc('auth_org_id').maybeSingle()
    const orgId = (orgIdResult.data as string | null) ?? ''

    const exception = await createRuleException({
      ...parsed.data,
      organization_id: orgId,
      override_value: parsed.data.override_value ?? null,
      override_value_currency: parsed.data.override_value_currency ?? null,
      effective_to: parsed.data.effective_to ?? null,
      status: 'requested',
      requested_by: user.id,
      created_by: user.id,
      updated_by: user.id,
    }, client)

    return NextResponse.json({ data: exception }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create exception' }, { status: 500 })
  }
}
