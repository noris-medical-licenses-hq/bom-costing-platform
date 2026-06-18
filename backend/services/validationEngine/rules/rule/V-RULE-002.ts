import type { SupabaseServerClient } from '../../../../lib/supabase'
import type { ValidationFindingInput } from '../../types'

// V-RULE-002: Rule action value must be within valid range for its action_type.
export async function validateRuleActionValues(
  ruleId: string,
  client: SupabaseServerClient
): Promise<ValidationFindingInput[]> {
  const { data: actions } = await client
    .from('rule_actions')
    .select('id, action_type, action_value')
    .eq('cost_rule_id', ruleId)

  if (!actions) return []

  const findings: ValidationFindingInput[] = []

  for (const action of actions) {
    const v = action.action_value
    if (v === null) continue

    let invalid = false
    let hint = ''

    switch (action.action_type) {
      case 'add_percentage':
        invalid = v < -100 || v > 1000
        hint = 'add_percentage should be between -100% and 1000%.'
        break
      case 'multiply':
        invalid = v <= 0
        hint = 'multiply factor must be > 0.'
        break
      case 'cap_at_value':
      case 'floor_at_value':
      case 'add_fixed':
      case 'replace_cost':
        invalid = v < 0
        hint = 'Cost values must be >= 0.'
        break
    }

    if (invalid) {
      findings.push({
        rule_code: 'V-RULE-002',
        severity: 'error',
        entity_type: 'rule_action',
        entity_id: action.id,
        message: `Rule action "${action.action_type}" has value ${v} which is outside valid range. ${hint}`,
        suggested_fix: hint,
      })
    }
  }

  return findings
}
