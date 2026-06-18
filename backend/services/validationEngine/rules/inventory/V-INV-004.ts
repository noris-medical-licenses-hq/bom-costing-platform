import type { SupabaseServerClient } from '../../../../lib/supabase'
import type { ValidationFindingInput } from '../../types'

// V-INV-004: Snapshot should not be approved when there are open ERROR-severity findings.
// This blocks approval if hard errors exist.
export async function validateSnapshotHasNoOpenErrors(
  snapshotId: string,
  client: SupabaseServerClient
): Promise<ValidationFindingInput[]> {
  const { count } = await client
    .from('validation_findings')
    .select('id', { count: 'exact', head: true })
    .eq('entity_id', snapshotId)
    .eq('severity', 'error')
    .eq('status', 'open')

  if ((count ?? 0) === 0) return []

  return [{
    rule_code: 'V-INV-004',
    severity: 'error',
    entity_type: 'inventory_snapshot',
    entity_id: snapshotId,
    message: `Snapshot has ${count} open ERROR finding(s). Resolve all errors before approving.`,
    suggested_fix: 'Fix or suppress each open error finding, then re-validate.',
  }]
}
