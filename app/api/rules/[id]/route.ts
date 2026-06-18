import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/backend/lib/supabase'
import { findCostRuleById, activateCostRule } from '@/backend/repositories/ruleRepository'
import { DbError } from '@/backend/repositories/base/errors'

const PatchRuleSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('activate') }),
  z.object({ action: z.literal('deactivate') }),
])

type RouteParams = { params: { id: string } }

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const client = await createServerSupabaseClient()
    const rule = await findCostRuleById(params.id, client)
    return NextResponse.json({ data: rule })
  } catch (err) {
    if (err instanceof DbError && err.code === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Failed to fetch rule' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const body = await request.json()
    const parsed = PatchRuleSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
    }
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (parsed.data.action === 'activate') {
      const rule = await activateCostRule(params.id, user.id, client)
      return NextResponse.json({ data: rule })
    }

    // deactivate — update is_active
    const { data, error } = await client
      .from('cost_rules')
      .update({ is_active: false, updated_by: user.id })
      .eq('id', params.id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: 'Failed to deactivate rule' }, { status: 500 })
    return NextResponse.json({ data })
  } catch (err) {
    if (err instanceof DbError && err.code === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Failed to update rule' }, { status: 500 })
  }
}
