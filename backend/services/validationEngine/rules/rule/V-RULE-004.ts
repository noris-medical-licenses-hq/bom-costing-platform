import type { SupabaseServerClient } from '../../../../lib/supabase'
import type { ValidationFindingInput } from '../../types'

// V-RULE-004: Rule exceptions past their effective_to date but still marked 'active'.
// These stale exceptions may silently suppress rule enforcement.
export async function validateNoStaleExceptions(
  ruleId: string,
  client: SupabaseServerClient
): Promise<ValidationFindingInput[]> {
  const today = new Date().toISOString().slice(0, 10)

  const { data: exceptions } = await client
    .from('rule_exceptions')
    .select('id, effective_to, exception_scope_type, exception_scope_id')
    .eq('cost_rule_id', ruleId)
    .eq('status', 'active')
    .not('effective_to', 'is', null)
    .lt('effective_to', today)

  if (!exceptions || exceptions.length === 0) return []

  return exceptions.map(ex => ({
    rule_code: 'V-RULE-004' as const,
    severity: 'warning' as const,
    entity_type: 'rule_exception',
    entity_id: ex.id,
    message: `Rule exception expired on ${ex.effective_to} but status is still "active". It will not suppress the rule but may cause confusion.`,
    suggested_fix: 'Set status to "expired" for this exception.',
  }))
}
