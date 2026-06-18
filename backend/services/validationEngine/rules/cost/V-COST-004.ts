import type { SupabaseServerClient } from '../../../../lib/supabase'
import type { ValidationFindingInput } from '../../types'

// V-COST-004: An active cost_set should have at least one global overhead_pct entry.
// This is a WARNING — calculations will proceed but overhead will be zero.
export async function validateGlobalOverheadExists(
  costSetId: string,
  client: SupabaseServerClient
): Promise<ValidationFindingInput[]> {
  const { count } = await client
    .from('cost_items')
    .select('id', { count: 'exact', head: true })
    .eq('cost_set_id', costSetId)
    .eq('item_type', 'overhead_pct')
    .eq('scope_type', 'global')

  if ((count ?? 0) > 0) return []

  return [{
    rule_code: 'V-COST-004',
    severity: 'warning',
    entity_type: 'cost_set',
    entity_id: costSetId,
    message: 'This cost set has no global overhead percentage defined. Overhead will be treated as 0%.',
    suggested_fix: 'Add a cost item with item_type=overhead_pct and scope_type=global.',
  }]
}
