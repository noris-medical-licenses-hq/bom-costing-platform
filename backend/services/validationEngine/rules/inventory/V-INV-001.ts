import type { SupabaseServerClient } from '../../../../lib/supabase'
import type { ValidationFindingInput } from '../../types'

// V-INV-001: Inventory line SKU should exist in an approved BOM version.
// WARNING — a purchased part may legitimately have no BOM.
export async function validateInventorySkusHaveBoms(
  snapshotId: string,
  client: SupabaseServerClient
): Promise<ValidationFindingInput[]> {
  const { data: lines } = await client
    .from('inventory_lines')
    .select('id, sku_id')
    .eq('snapshot_id', snapshotId)

  if (!lines || lines.length === 0) return []

  const skuIds = [...new Set(lines.map(l => l.sku_id))]

  // Find SKUs that are sub_assembly or finished_good (these should have BOMs)
  const { data: complexSkus } = await client
    .from('skus')
    .select('id, item_type, part_number')
    .in('id', skuIds)
    .in('item_type', ['sub_assembly', 'finished_good'])

  if (!complexSkus || complexSkus.length === 0) return []

  const complexSkuIds = complexSkus.map(s => s.id)

  // Find which have approved BOMs
  const { data: boms } = await client
    .from('boms')
    .select('id, sku_id')
    .in('sku_id', complexSkuIds)

  const bomsWithSku = new Set((boms ?? []).map(b => b.sku_id))
  if (bomsWithSku.size === 0) {
    // Check approved versions
    return complexSkus.map(sku => ({
      rule_code: 'V-INV-001' as const,
      severity: 'warning' as const,
      entity_type: 'sku',
      entity_id: sku.id,
      message: `SKU "${sku.part_number}" (${sku.item_type}) in inventory snapshot has no BOM. Cost will be zero.`,
      suggested_fix: 'Create and approve a BOM for this SKU, or set make_buy to "buy" and add a supplier price.',
    }))
  }

  const bomIds = (boms ?? []).filter(b => bomsWithSku.has(b.sku_id)).map(b => b.id)
  const { data: approvedVersions } = await client
    .from('bom_versions')
    .select('bom_id')
    .in('bom_id', bomIds)
    .eq('status', 'approved')

  const skusWithApprovedBom = new Set(
    (approvedVersions ?? [])
      .map(v => (boms ?? []).find(b => b.id === v.bom_id)?.sku_id)
      .filter((id): id is string => id !== undefined)
  )

  const skuMap = new Map(complexSkus.map(s => [s.id, s]))
  return complexSkuIds
    .filter(id => !skusWithApprovedBom.has(id))
    .map(id => {
      const sku = skuMap.get(id)!
      return {
        rule_code: 'V-INV-001' as const,
        severity: 'warning' as const,
        entity_type: 'sku',
        entity_id: id,
        message: `SKU "${sku.part_number}" (${sku.item_type}) has no approved BOM. Inventory valuation will use zero or fallback cost.`,
        suggested_fix: 'Approve a BOM version for this SKU before running inventory valuation.',
      }
    })
}
