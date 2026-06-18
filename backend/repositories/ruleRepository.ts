import type { SupabaseServerClient } from '../lib/supabase'
import type { Tables, Inserts } from '../types/database.generated'
import { handleSupabaseError, NotFoundError } from './base/errors'

export type CostRule = Tables<'cost_rules'>
export type RuleCondition = Tables<'rule_conditions'>
export type RuleAction = Tables<'rule_actions'>
export type RuleException = Tables<'rule_exceptions'>

export interface ActiveRule {
  rule: CostRule
  conditions: RuleCondition[]
  actions: RuleAction[]
  exceptions: RuleException[]
}

// ─── Cost Rules ──────────────────────────────────────────────────────────────

export async function listCostRules(client: SupabaseServerClient): Promise<CostRule[]> {
  const { data, error } = await client
    .from('cost_rules')
    .select('*')
    .order('priority', { ascending: true })
  if (error) handleSupabaseError(error, 'listCostRules', 'cost_rules')
  return data ?? []
}

export async function findCostRuleById(id: string, client: SupabaseServerClient): Promise<CostRule> {
  const { data, error } = await client.from('cost_rules').select('*').eq('id', id).single()
  if (error) handleSupabaseError(error, 'findCostRuleById', 'cost_rules')
  if (!data) throw new NotFoundError('CostRule', id)
  return data
}

export async function createCostRule(input: Inserts<'cost_rules'>, client: SupabaseServerClient): Promise<CostRule> {
  const { data, error } = await client.from('cost_rules').insert(input).select().single()
  if (error) handleSupabaseError(error, 'createCostRule', 'cost_rules')
  if (!data) throw new Error('createCostRule returned no data')
  return data
}

export async function activateCostRule(id: string, approvedBy: string, client: SupabaseServerClient): Promise<CostRule> {
  const { data, error } = await client
    .from('cost_rules')
    .update({ is_active: true, approved_by: approvedBy, approved_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) handleSupabaseError(error, 'activateCostRule', 'cost_rules')
  if (!data) throw new NotFoundError('CostRule', id)
  return data
}

// ─── Active Rule Loading (for cost engine) ────────────────────────────────────

// Returns all active rules with their conditions, actions, and exceptions.
// Filtered to rules effective on `valuationDate` and scoped to `costSetId` (or global).
// Ordered by priority ascending so lower number fires first.
export async function listActiveRules(
  costSetId: string,
  valuationDate: string,
  client: SupabaseServerClient
): Promise<ActiveRule[]> {
  const { data: rules, error: rulesError } = await client
    .from('cost_rules')
    .select('*')
    .eq('is_active', true)
    .lte('effective_from', valuationDate)
    .or(`effective_to.is.null,effective_to.gte.${valuationDate}`)
    .or(`cost_set_scope_id.is.null,cost_set_scope_id.eq.${costSetId}`)
    .order('priority', { ascending: true })
  if (rulesError) handleSupabaseError(rulesError, 'listActiveRules', 'cost_rules')
  if (!rules || rules.length === 0) return []

  const ruleIds = rules.map(r => r.id)

  const [conditionsResult, actionsResult, exceptionsResult] = await Promise.all([
    client.from('rule_conditions').select('*').in('cost_rule_id', ruleIds),
    client.from('rule_actions').select('*').in('cost_rule_id', ruleIds).order('action_sequence', { ascending: true }),
    client.from('rule_exceptions')
      .select('*')
      .in('cost_rule_id', ruleIds)
      .eq('status', 'active')
      .lte('effective_from', valuationDate)
      .or(`effective_to.is.null,effective_to.gte.${valuationDate}`),
  ])

  if (conditionsResult.error) handleSupabaseError(conditionsResult.error, 'listActiveRules:conditions', 'rule_conditions')
  if (actionsResult.error) handleSupabaseError(actionsResult.error, 'listActiveRules:actions', 'rule_actions')
  if (exceptionsResult.error) handleSupabaseError(exceptionsResult.error, 'listActiveRules:exceptions', 'rule_exceptions')

  const conditionsByRule = groupBy(conditionsResult.data ?? [], c => c.cost_rule_id)
  const actionsByRule = groupBy(actionsResult.data ?? [], a => a.cost_rule_id)
  const exceptionsByRule = groupBy(exceptionsResult.data ?? [], e => e.cost_rule_id)

  return rules.map(rule => ({
    rule,
    conditions: conditionsByRule[rule.id] ?? [],
    actions: actionsByRule[rule.id] ?? [],
    exceptions: exceptionsByRule[rule.id] ?? [],
  }))
}

// ─── Rule Exceptions ─────────────────────────────────────────────────────────

export async function createRuleException(
  input: Inserts<'rule_exceptions'>,
  client: SupabaseServerClient
): Promise<RuleException> {
  const { data, error } = await client.from('rule_exceptions').insert(input).select().single()
  if (error) handleSupabaseError(error, 'createRuleException', 'rule_exceptions')
  if (!data) throw new Error('createRuleException returned no data')
  return data
}

export async function approveRuleException(
  id: string,
  approvedBy: string,
  client: SupabaseServerClient
): Promise<RuleException> {
  const { data, error } = await client
    .from('rule_exceptions')
    .update({ status: 'active', approved_by: approvedBy, approved_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'approved')
    .select()
    .single()
  if (error) handleSupabaseError(error, 'approveRuleException', 'rule_exceptions')
  if (!data) throw new NotFoundError('RuleException', id)
  return data
}

// ─── Rule Conditions (write — read is bundled in listActiveRules) ─────────────

export async function createRuleConditions(
  inputs: Inserts<'rule_conditions'>[],
  client: SupabaseServerClient
): Promise<RuleCondition[]> {
  const { data, error } = await client.from('rule_conditions').insert(inputs).select()
  if (error) handleSupabaseError(error, 'createRuleConditions', 'rule_conditions')
  return data ?? []
}

export async function createRuleActions(
  inputs: Inserts<'rule_actions'>[],
  client: SupabaseServerClient
): Promise<RuleAction[]> {
  const { data, error } = await client.from('rule_actions').insert(inputs).select()
  if (error) handleSupabaseError(error, 'createRuleActions', 'rule_actions')
  return data ?? []
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupBy<T>(items: T[], key: (item: T) => string): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const k = key(item)
    ;(acc[k] ??= []).push(item)
    return acc
  }, {})
}
