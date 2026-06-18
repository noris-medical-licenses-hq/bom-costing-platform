import type { SupabaseServerClient } from '../../../../lib/supabase'
import type { ValidationFindingInput } from '../../types'

// V-RULE-003: An active rule must have at least one condition.
// A rule with no conditions would apply to every single cost line — almost never intentional.
export async function validateActiveRuleHasConditions(
  ruleId: string,
  client: SupabaseServerClient
): Promise<ValidationFindingInput[]> {
  const { data: rule } = await client
    .from('cost_rules')
    .select('id, name, is_active')
    .eq('id', ruleId)
    .single()

  if (!rule || !rule.is_active) return []

  const { count } = await client
    .from('rule_conditions')
    .select('id', { count: 'exact', head: true })
    .eq('cost_rule_id', ruleId)

  if ((count ?? 0) > 0) return []

  return [{
    rule_code: 'V-RULE-003',
    severity: 'warning',
    entity_type: 'cost_rule',
    entity_id: ruleId,
    message: `Active rule "${rule.name}" has no conditions and will apply to every cost line.`,
    suggested_fix: 'Add at least one condition to scope this rule, or deactivate it if not needed.',
  }]
}
