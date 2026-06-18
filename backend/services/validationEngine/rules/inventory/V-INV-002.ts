import type { SupabaseServerClient } from '../../../../lib/supabase'
import type { ValidationFindingInput } from '../../types'

// V-INV-002: No cost found for an inventory line's SKU.
// ERROR — this line will have zero value in the valuation.
export async function validateInventoryLinesHaveCosts(
  snapshotId: string,
  client: SupabaseServerClient
): Promise<ValidationFindingInput[]> {
  const { data: lines } = await client
    .from('inventory_lines')
    .select('id, sku_id, has_missing_cost')
    .eq('snapshot_id', snapshotId)
    .eq('has_missing_cost', true)

  if (!lines || lines.length === 0) return []

  // Get SKU part numbers for better messages
  const skuIds = [...new Set(lines.map(l => l.sku_id))]
  const { data: skus } = await client.from('skus').select('id, part_number').in('id', skuIds)
  const skuMap = new Map((skus ?? []).map(s => [s.id, s.part_number]))

  return lines.map(line => ({
    rule_code: 'V-INV-002' as const,
    severity: 'error' as const,
    entity_type: 'inventory_line',
    entity_id: line.id,
    message: `No cost found for SKU "${skuMap.get(line.sku_id) ?? line.sku_id}". This inventory line will be valued at zero.`,
    suggested_fix: 'Add a supplier price or cost item for this SKU, then re-run valuation.',
  }))
}
