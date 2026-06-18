import type { SupabaseServerClient } from '../../../../lib/supabase'
import type { ValidationFindingInput } from '../../types'

// V-BOM-007: Sub-assembly lines should reference SKUs with make_buy='make' or 'make_or_buy'.
// A BOM line with children (sub-assembly) that points to a 'buy'-only SKU is a warning —
// it suggests the part should be configured as 'make' or 'make_or_buy'.
export async function validateSubAssemblyMakeBuy(
  bomVersionId: string,
  client: SupabaseServerClient
): Promise<ValidationFindingInput[]> {
  // Find lines that have children (i.e., are referenced as parent_line_id by other lines)
  const { data: allLines, error } = await client
    .from('bom_lines')
    .select('id, sku_id, parent_line_id, skus(id, part_number, make_buy)')
    .eq('bom_version_id', bomVersionId)

  if (error || !allLines) return []

  // Identify which line IDs are parents
  const parentIds = new Set(allLines.map(l => l.parent_line_id).filter(Boolean))

  const findings: ValidationFindingInput[] = []
  for (const line of allLines) {
    if (!parentIds.has(line.id)) continue  // leaf — skip
    if (!line.sku_id) continue             // virtual component assembly — skip

    const sku = Array.isArray(line.skus) ? line.skus[0] : line.skus
    if (sku && sku.make_buy === 'buy') {
      findings.push({
        rule_code: 'V-BOM-007',
        severity: 'warning',
        entity_type: 'bom_line',
        entity_id: line.id,
        message: `Sub-assembly line references a 'buy'-only SKU: ${sku.part_number}. SKUs with children in a BOM should have make_buy='make' or 'make_or_buy'.`,
        suggested_fix: `Change SKU ${sku.part_number} make_buy to 'make' or 'make_or_buy', or remove its child BOM lines.`,
      })
    }
  }
  return findings
}
