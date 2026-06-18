import type { SupabaseServerClient } from '../../../../lib/supabase'
import type { ValidationFindingInput } from '../../types'

// V-INV-003: Snapshot total valuation is zero — likely indicates missing costs.
// WARNING — zero is technically valid for an empty or fully-uncosted snapshot.
export async function validateSnapshotTotalNotZero(
  snapshotId: string,
  client: SupabaseServerClient
): Promise<ValidationFindingInput[]> {
  const { data: snapshot } = await client
    .from('inventory_snapshots')
    .select('id, total_value, line_count, snapshot_name')
    .eq('id', snapshotId)
    .single()

  if (!snapshot) return []
  if ((snapshot.line_count ?? 0) === 0) return [] // empty snapshot is ok
  if ((snapshot.total_value ?? 0) !== 0) return []

  return [{
    rule_code: 'V-INV-003',
    severity: 'warning',
    entity_type: 'inventory_snapshot',
    entity_id: snapshotId,
    message: `Snapshot "${snapshot.snapshot_name}" has ${snapshot.line_count} inventory lines but a total value of zero. This usually means costs are missing.`,
    suggested_fix: 'Run inventory valuation after adding cost data, then re-validate.',
  }]
}
