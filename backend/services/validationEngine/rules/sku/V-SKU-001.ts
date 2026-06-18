import type { SupabaseServerClient } from '../../../../lib/supabase'
import type { ValidationFindingInput } from '../../types'

// V-SKU-001: part_number must be unique within org.
// When scope_type = 'sku', checks whether the given SKU's part_number conflicts
// with another active SKU in the same organization.
export async function validateSkuPartNumberUnique(
  skuId: string,
  client: SupabaseServerClient
): Promise<ValidationFindingInput[]> {
  const { data: sku } = await client.from('skus').select('id, part_number, organization_id').eq('id', skuId).single()
  if (!sku) return []

  const { count } = await client.from('skus')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', sku.organization_id)
    .eq('part_number', sku.part_number)
    .neq('id', skuId)

  if ((count ?? 0) === 0) return []

  return [{
    rule_code: 'V-SKU-001',
    severity: 'error',
    entity_type: 'sku',
    entity_id: skuId,
    message: `Part number "${sku.part_number}" is already used by another SKU in this organization.`,
    suggested_fix: 'Change the part number to a unique value.',
  }]
}
