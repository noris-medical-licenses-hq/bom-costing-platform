import type { SupabaseServerClient } from '../../../../lib/supabase'
import type { ValidationFindingInput } from '../../types'

// V-BOM-006: BOM lines must not reference archived SKUs.
// Distinct from V-BOM-002 (inactive) — archived means the part was removed from production.
export async function validateNoBomLinesWithArchivedSkus(
  bomVersionId: string,
  client: SupabaseServerClient
): Promise<ValidationFindingInput[]> {
  const { data: lines, error } = await client
    .from('bom_lines')
    .select('id, sku_id, skus!inner(id, part_number, status)')
    .eq('bom_version_id', bomVersionId)
    .not('sku_id', 'is', null)

  if (error || !lines) return []

  const findings: ValidationFindingInput[] = []
  for (const line of lines) {
    const sku = Array.isArray(line.skus) ? line.skus[0] : line.skus
    if (sku && sku.status === 'archived') {
      findings.push({
        rule_code: 'V-BOM-006',
        severity: 'error',
        entity_type: 'bom_line',
        entity_id: line.id,
        message: `BOM line references archived SKU: ${sku.part_number} (id=${sku.id}). Archived SKUs cannot be costed.`,
        suggested_fix: 'Remove or replace this BOM line with an active SKU.',
      })
    }
  }
  return findings
}
