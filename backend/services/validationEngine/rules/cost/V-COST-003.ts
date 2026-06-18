import type { SupabaseServerClient } from '../../../../lib/supabase'
import type { ValidationFindingInput } from '../../types'

// V-COST-003: Scrap rate must be between 0% and 100%.
export async function validateScrapRateRange(
  costSetId: string,
  client: SupabaseServerClient
): Promise<ValidationFindingInput[]> {
  const { data: items } = await client
    .from('cost_items')
    .select('id, value, scope_type, scope_id')
    .eq('cost_set_id', costSetId)
    .eq('item_type', 'scrap_rate')

  if (!items) return []

  return items
    .filter(i => i.value < 0 || i.value > 100)
    .map(i => ({
      rule_code: 'V-COST-003' as const,
      severity: 'error' as const,
      entity_type: 'cost_item',
      entity_id: i.id,
      message: `Scrap rate ${i.value}% is out of range. Must be between 0% and 100%.`,
      suggested_fix: 'Correct the scrap rate to a value between 0 and 100.',
    }))
}
