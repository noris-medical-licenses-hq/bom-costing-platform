import type { SupabaseServerClient } from '../../../../lib/supabase'
import type { ValidationFindingInput } from '../../types'

// V-COST-002: Effective date ranges for the same scope must not overlap within one cost_set.
export async function validateNoCostItemDateOverlap(
  costSetId: string,
  client: SupabaseServerClient
): Promise<ValidationFindingInput[]> {
  const { data: items } = await client
    .from('cost_items')
    .select('id, item_type, scope_type, scope_id, scope_code, effective_from, effective_to')
    .eq('cost_set_id', costSetId)
    .not('effective_from', 'is', null)
    .order('scope_type').order('scope_id').order('item_type').order('effective_from')

  if (!items || items.length < 2) return []

  const findings: ValidationFindingInput[] = []

  // Group by (item_type, scope_type, scope_id)
  const groups = new Map<string, typeof items>()
  for (const item of items) {
    const key = `${item.item_type}::${item.scope_type}::${item.scope_id ?? item.scope_code ?? ''}`
    const g = groups.get(key) ?? []
    g.push(item)
    groups.set(key, g)
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue
    // Items are ordered by effective_from; check consecutive pairs
    for (let i = 0; i < group.length - 1; i++) {
      const a = group[i]
      const b = group[i + 1]
      // a ends after b starts (or a never ends)
      const aEnd = a.effective_to ?? '9999-12-31'
      if (aEnd >= b.effective_from!) {
        findings.push({
          rule_code: 'V-COST-002',
          severity: 'warning',
          entity_type: 'cost_item',
          entity_id: b.id,
          message: `Cost item date range overlaps with another entry for the same scope (${a.scope_type}/${a.scope_id ?? a.scope_code}).`,
          suggested_fix: 'Ensure effective_to of the earlier record is before effective_from of the later record.',
        })
      }
    }
  }

  return findings
}
