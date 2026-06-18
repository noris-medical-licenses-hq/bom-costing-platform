import type { SupabaseServerClient } from '../lib/supabase'
import type { Tables } from '../types/database.generated'
import { handleSupabaseError } from './base/errors'

export type AuditLogEntry = Tables<'audit_log'>

export type AuditFilters = {
  table_name?: string
  performed_by?: string
  event_type?: string
  event_category?: AuditLogEntry['event_category']
  from?: string
  to?: string
  limit?: number
  cursor?: string
}

// Read-only repository. audit_log INSERT/UPDATE/DELETE is handled by DB trigger.
// RLS ensures only admin and approver roles can read.
export async function listAuditLog(
  filters: AuditFilters = {},
  client: SupabaseServerClient
): Promise<{ entries: AuditLogEntry[]; nextCursor: string | null }> {
  const pageSize = Math.min(filters.limit ?? 50, 200)

  let query = client.from('audit_log')
    .select('*')
    .order('performed_at', { ascending: false })
    .limit(pageSize + 1)

  if (filters.table_name) query = query.eq('table_name', filters.table_name)
  if (filters.performed_by) query = query.eq('performed_by', filters.performed_by)
  if (filters.event_type) query = query.eq('event_type', filters.event_type)
  if (filters.event_category) query = query.eq('event_category', filters.event_category)
  if (filters.from) query = query.gte('performed_at', filters.from)
  if (filters.to) query = query.lte('performed_at', filters.to)
  if (filters.cursor) query = query.lt('performed_at', filters.cursor)

  const { data, error } = await query
  if (error) handleSupabaseError(error, 'listAuditLog', 'audit_log')

  const entries = data ?? []
  const hasMore = entries.length > pageSize
  if (hasMore) entries.pop()

  return {
    entries,
    nextCursor: hasMore ? entries[entries.length - 1]?.performed_at ?? null : null,
  }
}

export async function listAuditLogByRecord(
  tableName: string,
  recordId: string,
  client: SupabaseServerClient
): Promise<AuditLogEntry[]> {
  const { data, error } = await client.from('audit_log')
    .select('*')
    .eq('table_name', tableName)
    .eq('record_id', recordId)
    .order('performed_at', { ascending: false })
    .limit(100)
  if (error) handleSupabaseError(error, 'listAuditLogByRecord', 'audit_log')
  return data ?? []
}
