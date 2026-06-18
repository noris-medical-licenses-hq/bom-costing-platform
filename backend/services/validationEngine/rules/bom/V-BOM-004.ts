import type { SupabaseServerClient } from '../../../../lib/supabase'
import type { ValidationFindingInput } from '../../types'

// V-BOM-004: All bom_line quantities must be > 0.
// The DB CHECK constraint also enforces this, but validation provides a user-friendly message.
export async function validateBomLineQuantities(
  bomVersionId: string,
  client: SupabaseServerClient
): Promise<ValidationFindingInput[]> {
  const { data: lines } = await client.from('bom_lines')
    .select('id, quantity')
    .eq('bom_version_id', bomVersionId)
    .lte('quantity', 0)

  return (lines ?? []).map(line => ({
    rule_code: 'V-BOM-004' as const,
    severity: 'error' as const,
    entity_type: 'bom_line',
    entity_id: line.id,
    message: `BOM line has quantity ${line.quantity}. Quantity must be greater than 0.`,
    suggested_fix: 'Set quantity to a positive number.',
  }))
}
