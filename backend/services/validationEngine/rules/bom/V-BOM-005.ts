import type { SupabaseServerClient } from '../../../../lib/supabase'
import type { ValidationFindingInput } from '../../types'
import { loadBomTree } from '../../../../repositories/bomRepository'
import { detectBomCycle } from '../../../costEngine/cycle'

// V-BOM-005: BOM must not contain cycles.
// Cycle detection runs at write time (ADR-106) so this should never fire in production.
// This validator is a belt-and-suspenders check for pre-calculation and pre-approval runs.
export async function validateNoBomCycle(
  bomVersionId: string,
  client: SupabaseServerClient
): Promise<ValidationFindingInput[]> {
  const lines = await loadBomTree(bomVersionId, client)
  const cyclePath = detectBomCycle(lines)
  if (!cyclePath) return []
  return [{
    rule_code: 'V-BOM-005',
    severity: 'error',
    entity_type: 'bom_version',
    entity_id: bomVersionId,
    message: `BOM contains a circular reference: ${cyclePath.join(' → ')}. This BOM cannot be costed.`,
    suggested_fix: 'Remove the BOM line(s) that create the cycle.',
  }]
}
