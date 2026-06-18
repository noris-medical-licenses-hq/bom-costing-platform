import type { SupabaseServerClient } from '../../../../lib/supabase'
import type { ValidationFindingInput } from '../../types'

// V-COST-005: SKUs with supplier_prices but no cost_set_item in this cost_set.
// INFO only — supplier_price acts as fallback, but explicit cost_set_items are preferred.
export async function validateSupplierPricesCoveredByCostItems(
  costSetId: string,
  client: SupabaseServerClient
): Promise<ValidationFindingInput[]> {
  const today = new Date().toISOString().slice(0, 10)

  // Get SKUs that have active supplier prices
  const { data: prices } = await client
    .from('supplier_prices')
    .select('sku_id')
    .lte('effective_from', today)
    .or(`effective_to.is.null,effective_to.gte.${today}`)

  if (!prices || prices.length === 0) return []

  const skuIds = [...new Set(prices.map(p => p.sku_id))]

  // Check which of those also have a SKU-scoped cost_item in this cost_set
  const { data: covered } = await client
    .from('cost_items')
    .select('scope_id')
    .eq('cost_set_id', costSetId)
    .eq('scope_type', 'sku')
    .in('scope_id', skuIds)

  const coveredIds = new Set((covered ?? []).map(c => c.scope_id))
  const uncovered = skuIds.filter(id => !coveredIds.has(id))

  return uncovered.map(skuId => ({
    rule_code: 'V-COST-005' as const,
    severity: 'info' as const,
    entity_type: 'sku',
    entity_id: skuId,
    message: `SKU has a supplier price but no explicit cost item in this cost set. The engine will fall back to the supplier price.`,
    suggested_fix: 'Add a cost item for this SKU in the cost set if you need to override the supplier price.',
  }))
}
