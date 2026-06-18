import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/backend/lib/supabase'
import { listCostRules, createCostRule, createRuleConditions, createRuleActions } from '@/backend/repositories/ruleRepository'

const ConditionSchema = z.object({
  condition_field: z.string().min(1),
  condition_operator: z.enum(['equals', 'not_equals', 'in', 'not_in', 'greater_than', 'less_than', 'is_null', 'is_not_null']),
  condition_value: z.string(),
  logical_group: z.number().int().min(0).default(0),
})

const ActionSchema = z.object({
  action_type: z.enum(['add_percentage', 'add_fixed', 'multiply', 'replace_cost', 'exclude_from_rollup', 'cap_at_value', 'floor_at_value']),
  action_value: z.number().nullable().optional(),
  action_currency: z.string().nullable().optional(),
  applies_to_item_type: z.string().nullable().optional(),
  action_sequence: z.number().int().min(0).default(0),
})

const CreateRuleSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().min(1),
  pipeline_stage: z.enum(['after_cost_resolution', 'after_rollup']).default('after_cost_resolution'),
  priority: z.number().int().min(1),
  cost_set_scope_id: z.string().uuid().nullable().optional(),
  effective_from: z.string().datetime(),
  effective_to: z.string().datetime().nullable().optional(),
  requires_approval: z.boolean().default(false),
  conditions: z.array(ConditionSchema).min(1),
  actions: z.array(ActionSchema).min(1),
})

export async function GET(_req: NextRequest) {
  try {
    const client = await createServerSupabaseClient()
    const rules = await listCostRules(client)
    return NextResponse.json({ data: rules })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch rules' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = CreateRuleSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
    }
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const orgIdResult = await client.rpc('auth_org_id').maybeSingle()
    const orgId = (orgIdResult.data as string | null) ?? ''

    const { conditions, actions, ...ruleInput } = parsed.data
    const rule = await createCostRule({
      ...ruleInput,
      organization_id: orgId,
      effective_to: ruleInput.effective_to ?? null,
      cost_set_scope_id: ruleInput.cost_set_scope_id ?? null,
      created_by: user.id,
      updated_by: user.id,
    }, client)

    await Promise.all([
      createRuleConditions(conditions.map(c => ({ ...c, organization_id: orgId, cost_rule_id: rule.id, created_by: user.id })), client),
      createRuleActions(actions.map(a => ({ ...a, organization_id: orgId, cost_rule_id: rule.id, action_value: a.action_value ?? null, action_currency: a.action_currency ?? null, applies_to_item_type: a.applies_to_item_type ?? null, created_by: user.id })), client),
    ])

    return NextResponse.json({ data: rule }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create rule' }, { status: 500 })
  }
}
