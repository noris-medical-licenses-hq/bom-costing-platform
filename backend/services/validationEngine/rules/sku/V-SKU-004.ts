import type { SupabaseServerClient } from '../../../../lib/supabase'
import type { ValidationFindingInput } from '../../types'

// V-SKU-004: No active cost found for this SKU in any active cost_set.
// Generates a WARNING — a missing cost will not block BOM approval but will block calculation.
export async function validateSkuHasActiveCost(
  skuId: string,
  client: SupabaseServerClient
): Promise<ValidationFindingInput[]> {
  const { data: sku } = await client.from('skus').select('id, part_number, status').eq('id', skuId).single()
  if (!sku || sku.status === 'archived') return []

  const today = new Date().toISOString().slice(0, 10)

  // Find active cost_sets with a cost_item scoped to this SKU (or global/family fallback)
  const { count } = await client
    .from('cost_items')
    .select('id', { count: 'exact', head: true })
    .eq('scope_type', 'sku')
    .eq('scope_id', skuId)
    .or(`effective_from.is.null,effective_from.lte.${today}`)
    .or(`effective_to.is.null,effective_to.gte.${today}`)

  if ((count ?? 0) > 0) return []

  // Also check supplier prices as a fallback cost source
  const { count: priceCount } = await client
    .from('supplier_prices')
    .select('id', { count: 'exact', head: true })
    .eq('sku_id', skuId)
    .lte('effective_from', today)
    .or(`effective_to.is.null,effective_to.gte.${today}`)

  if ((priceCount ?? 0) > 0) return []

  return [{
    rule_code: 'V-SKU-004',
    severity: 'warning',
    entity_type: 'sku',
    entity_id: skuId,
    message: `SKU "${sku.part_number}" has no active cost entry (cost_item or supplier_price). Cost calculation will leave this SKU at zero.`,
    suggested_fix: 'Add a cost item in an active cost set or add a supplier price record.',
  }]
}
