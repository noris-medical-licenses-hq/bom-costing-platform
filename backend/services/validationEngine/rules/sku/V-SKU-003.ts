import type { SupabaseServerClient } from '../../../../lib/supabase'
import type { ValidationFindingInput } from '../../types'

// V-SKU-003: A discontinued SKU should not be the top-level assembly in an approved BOM.
// Generates a WARNING — the BOM may still be valid if it is being phased out.
export async function validateNoDiscontinuedSkuInActiveBom(
  skuId: string,
  client: SupabaseServerClient
): Promise<ValidationFindingInput[]> {
  const { data: sku } = await client.from('skus').select('id, status, part_number').eq('id', skuId).single()
  if (!sku || sku.status !== 'discontinued') return []

  // Check whether there is an active or approved BOM version for this SKU
  const { count } = await client
    .from('bom_versions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'approved')
    .in('bom_id', (await client.from('boms').select('id').eq('sku_id', skuId)).data?.map(b => b.id) ?? [])

  if ((count ?? 0) === 0) return []

  return [{
    rule_code: 'V-SKU-003',
    severity: 'warning',
    entity_type: 'sku',
    entity_id: skuId,
    message: `SKU "${sku.part_number}" is discontinued but still has an approved BOM version.`,
    suggested_fix: 'Archive the BOM or reactivate the SKU if it is still in production.',
  }]
}
