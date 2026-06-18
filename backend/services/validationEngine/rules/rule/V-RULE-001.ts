import type { SupabaseServerClient } from '../../../../lib/supabase'
import type { ValidationFindingInput } from '../../types'

// Known fields that condition_field can reference (table.column format).
const KNOWN_SKU_FIELDS = new Set([
  'sku.item_type',
  'sku.make_buy',
  'sku.family_id',
  'sku.subfamily_id',
  'sku.status',
  'sku.default_supplier_id',
  'sku.unit_of_measure',
  'sku.is_regulated',
  'sku.lead_time_days',
  'cost_item.item_type',
  'cost_item.scope_type',
  'cost_item.value',
  'cost_item.currency',
  'bom_line.quantity',
  'bom_line.depth',
])

// V-RULE-001: Rule condition references a field not in the known schema.
export async function validateRuleConditionFields(
  ruleId: string,
  client: SupabaseServerClient
): Promise<ValidationFindingInput[]> {
  const { data: conditions } = await client
    .from('rule_conditions')
    .select('id, condition_field')
    .eq('cost_rule_id', ruleId)

  if (!conditions) return []

  return conditions
    .filter(c => !KNOWN_SKU_FIELDS.has(c.condition_field))
    .map(c => ({
      rule_code: 'V-RULE-001' as const,
      severity: 'error' as const,
      entity_type: 'rule_condition',
      entity_id: c.id,
      message: `Rule condition references unknown field "${c.condition_field}". This condition will never match.`,
      suggested_fix: `Use a known field in format table.column. Known fields: ${[...KNOWN_SKU_FIELDS].join(', ')}`,
    }))
}
