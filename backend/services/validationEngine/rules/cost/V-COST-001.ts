import type { SupabaseServerClient } from '../../../../lib/supabase'
import type { ValidationFindingInput } from '../../types'

// V-COST-001: cost_items with currency must match the cost_set's base_currency.
// Prevents silent currency mismatch where a cost_item was entered in USD but the cost_set is EUR.
export async function validateCostItemCurrencies(
  costSetId: string,
  client: SupabaseServerClient
): Promise<ValidationFindingInput[]> {
  const [costSetResult, itemsResult] = await Promise.all([
    client.from('cost_sets').select('id, base_currency').eq('id', costSetId).single(),
    client.from('cost_items')
      .select('id, scope_type, scope_id, item_type, currency')
      .eq('cost_set_id', costSetId)
      .not('currency', 'is', null),
  ])

  if (costSetResult.error || !costSetResult.data) return []
  if (itemsResult.error || !itemsResult.data) return []

  const baseCurrency = costSetResult.data.base_currency
  const findings: ValidationFindingInput[] = []

  for (const item of itemsResult.data) {
    if (item.currency && item.currency !== baseCurrency) {
      findings.push({
        rule_code: 'V-COST-001',
        severity: 'error',
        entity_type: 'cost_item',
        entity_id: item.id,
        message: `Cost item has currency ${item.currency} but cost_set base_currency is ${baseCurrency}. Currency mismatch will produce incorrect cost calculations.`,
        suggested_fix: `Update the cost item to use ${baseCurrency}, or change the cost_set base_currency.`,
      })
    }
  }
  return findings
}
