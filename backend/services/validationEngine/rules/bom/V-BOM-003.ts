import type { SupabaseServerClient } from '../../../../lib/supabase'
import type { ValidationFindingInput } from '../../types'

// V-BOM-003: Warn if the same SKU appears twice under the same parent at the same level.
// This is a WARNING, not an error — same SKU at same parent can be valid with different ref designators.
export async function validateNoDuplicateBomLines(
  bomVersionId: string,
  client: SupabaseServerClient
): Promise<ValidationFindingInput[]> {
  const { data: lines } = await client.from('bom_lines')
    .select('id, sku_id, parent_line_id')
    .eq('bom_version_id', bomVersionId)
    .not('sku_id', 'is', null)

  if (!lines) return []

  const findings: ValidationFindingInput[] = []
  const seen = new Map<string, string>()

  for (const line of lines) {
    const key = `${line.parent_line_id ?? 'root'}::${line.sku_id}`
    if (seen.has(key)) {
      findings.push({
        rule_code: 'V-BOM-003',
        severity: 'warning',
        entity_type: 'bom_line',
        entity_id: line.id,
        message: `SKU ${line.sku_id} appears more than once under the same parent. Verify reference designators are distinct.`,
        suggested_fix: 'Confirm this is intentional (e.g. R1 and R2 are separate components). Add reference designators to distinguish them.',
      })
    } else {
      seen.set(key, line.id)
    }
  }
  return findings
}
