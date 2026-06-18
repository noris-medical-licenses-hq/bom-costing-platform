import type { SupabaseServerClient } from '../lib/supabase'
import type { Tables, Inserts } from '../types/database.generated'
import { handleSupabaseError } from './base/errors'

export type ValidationRun = Tables<'validation_runs'>
export type ValidationFinding = Tables<'validation_findings'>

export async function createValidationRun(
  input: Inserts<'validation_runs'>,
  client: SupabaseServerClient
): Promise<ValidationRun> {
  const { data, error } = await client.from('validation_runs').insert(input).select().single()
  if (error) handleSupabaseError(error, 'createValidationRun', 'validation_runs')
  if (!data) throw new Error('createValidationRun returned no data')
  return data
}

export async function completeValidationRun(
  id: string,
  counts: { error_count: number; warning_count: number; info_count: number },
  client: SupabaseServerClient
): Promise<ValidationRun> {
  const { data, error } = await client.from('validation_runs')
    .update({ status: 'completed', completed_at: new Date().toISOString(), ...counts })
    .eq('id', id).select().single()
  if (error) handleSupabaseError(error, 'completeValidationRun', 'validation_runs')
  if (!data) throw new Error('completeValidationRun returned no data')
  return data
}

export async function createFindingsBatch(
  findings: Inserts<'validation_findings'>[],
  client: SupabaseServerClient
): Promise<ValidationFinding[]> {
  if (findings.length === 0) return []
  const { data, error } = await client.from('validation_findings').insert(findings).select()
  if (error) handleSupabaseError(error, 'createFindingsBatch', 'validation_findings')
  return data ?? []
}

// Auto-resolve findings from a previous run when the issue is no longer detected (OQ-07).
export async function autoResolveStaleFindingsForEntities(
  entityType: string,
  entityIds: string[],
  activeRuleCodes: string[],
  client: SupabaseServerClient
): Promise<number> {
  if (entityIds.length === 0 || activeRuleCodes.length === 0) return 0
  const { data, error } = await client.from('validation_findings')
    .update({ status: 'resolved', resolved_at: new Date().toISOString(), resolved_by: null })
    .eq('entity_type', entityType)
    .in('entity_id', entityIds)
    .not('rule_code', 'in', `(${activeRuleCodes.map(c => `"${c}"`).join(',')})`)
    .eq('status', 'open')
    .select('id')
  if (error) handleSupabaseError(error, 'autoResolveStaleFindingsForEntities', 'validation_findings')
  return data?.length ?? 0
}

export async function listFindingsByEntity(
  entityType: string,
  entityId: string,
  client: SupabaseServerClient
): Promise<ValidationFinding[]> {
  const { data, error } = await client.from('validation_findings')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('status', 'open')
    .order('severity')
  if (error) handleSupabaseError(error, 'listFindingsByEntity', 'validation_findings')
  return data ?? []
}
