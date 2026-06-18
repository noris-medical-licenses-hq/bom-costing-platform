import type { SupabaseServerClient } from '../../../../lib/supabase'
import type { ValidationFindingInput } from '../../types'

// V-BOM-001: BOM must have at least one line.
export async function validateBomHasLines(
  bomVersionId: string,
  client: SupabaseServerClient
): Promise<ValidationFindingInput[]> {
  const { count, error } = await client.from('bom_lines')
    .select('id', { count: 'exact', head: true })
    .eq('bom_version_id', bomVersionId)
  if (error || (count ?? 0) > 0) return []
  return [{
    rule_code: 'V-BOM-001',
    severity: 'error',
    entity_type: 'bom_version',
    entity_id: bomVersionId,
    message: 'BOM version has no lines. A BOM must contain at least one component.',
    suggested_fix: 'Add at least one BOM line before approving.',
  }]
}
