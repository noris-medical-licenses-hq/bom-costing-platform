import type { SupabaseServerClient } from '../../../../lib/supabase'
import type { ValidationFindingInput } from '../../types'

// V-BOM-002: All bom_lines must reference existing, active SKUs (or active virtual components).
export async function validateBomLinesReferenceActiveSkus(
  bomVersionId: string,
  client: SupabaseServerClient
): Promise<ValidationFindingInput[]> {
  const findings: ValidationFindingInput[] = []

  const { data: lines } = await client.from('bom_lines')
    .select('id, sku_id, virtual_component_id')
    .eq('bom_version_id', bomVersionId)

  if (!lines) return []

  const skuIds = lines.map(l => l.sku_id).filter((id): id is string => id !== null)
  const vcIds = lines.map(l => l.virtual_component_id).filter((id): id is string => id !== null)

  const [skus, vcs] = await Promise.all([
    skuIds.length > 0
      ? client.from('skus').select('id, status').in('id', skuIds)
      : { data: [] },
    vcIds.length > 0
      ? client.from('virtual_components').select('id, is_active').in('id', vcIds)
      : { data: [] },
  ])

  const inactiveSkus = new Set(
    (skus.data ?? []).filter(s => s.status !== 'active').map(s => s.id)
  )
  const inactiveVcs = new Set(
    (vcs.data ?? []).filter(v => !v.is_active).map(v => v.id)
  )

  for (const line of lines) {
    if (line.sku_id && inactiveSkus.has(line.sku_id)) {
      findings.push({
        rule_code: 'V-BOM-002',
        severity: 'error',
        entity_type: 'bom_line',
        entity_id: line.id,
        message: `BOM line references SKU ${line.sku_id} which is not active.`,
        suggested_fix: 'Replace or activate the SKU, or remove this BOM line.',
      })
    }
    if (line.virtual_component_id && inactiveVcs.has(line.virtual_component_id)) {
      findings.push({
        rule_code: 'V-BOM-002',
        severity: 'error',
        entity_type: 'bom_line',
        entity_id: line.id,
        message: `BOM line references virtual component ${line.virtual_component_id} which is inactive.`,
        suggested_fix: 'Activate the virtual component or remove this BOM line.',
      })
    }
  }
  return findings
}
