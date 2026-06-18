import type { SupabaseServerClient } from '../../../../lib/supabase'
import type { ValidationFindingInput } from '../../types'

// V-SKU-002: A SKU's subfamily must belong to its family.
// Guards against FK assignments where the subfamily's family_id differs from sku.family_id.
export async function validateSkuSubfamilyBelongsToFamily(
  skuId: string,
  client: SupabaseServerClient
): Promise<ValidationFindingInput[]> {
  const { data: sku, error } = await client
    .from('skus')
    .select('id, part_number, family_id, subfamily_id, subfamilies(id, family_id)')
    .eq('id', skuId)
    .single()

  if (error || !sku) return []
  if (!sku.subfamily_id || !sku.family_id) return []  // no subfamily assigned — no constraint to check

  const subfamily = Array.isArray(sku.subfamilies) ? sku.subfamilies[0] : sku.subfamilies
  if (!subfamily) return []

  if (subfamily.family_id !== sku.family_id) {
    return [{
      rule_code: 'V-SKU-002',
      severity: 'error',
      entity_type: 'sku',
      entity_id: skuId,
      message: `SKU ${sku.part_number}: subfamily (id=${sku.subfamily_id}) does not belong to the SKU's family (id=${sku.family_id}).`,
      suggested_fix: 'Update the SKU to use a subfamily that belongs to its assigned family, or remove the subfamily assignment.',
    }]
  }
  return []
}

// Batch version for validating all SKUs in a BOM
export async function validateBomSkuSubfamilies(
  bomVersionId: string,
  client: SupabaseServerClient
): Promise<ValidationFindingInput[]> {
  const { data: lines, error: lineError } = await client
    .from('bom_lines')
    .select('sku_id')
    .eq('bom_version_id', bomVersionId)
    .not('sku_id', 'is', null)
  if (lineError || !lines) return []

  const skuIds = [...new Set(lines.map(l => l.sku_id).filter(Boolean) as string[])]
  const results = await Promise.all(skuIds.map(id => validateSkuSubfamilyBelongsToFamily(id, client)))
  return results.flat()
}
