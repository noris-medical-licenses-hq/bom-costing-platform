import type { SupabaseServerClient } from '../lib/supabase'
import type { Tables, Inserts, Updates } from '../types/database.generated'
import { handleSupabaseError, NotFoundError } from './base/errors'

export type InventorySnapshot = Tables<'inventory_snapshots'>
export type InventorySnapshotInsert = Inserts<'inventory_snapshots'>
export type InventorySnapshotUpdate = Updates<'inventory_snapshots'>

export type InventoryLine = Tables<'inventory_lines'>
export type InventoryLineInsert = Inserts<'inventory_lines'>
export type InventoryLineUpdate = Updates<'inventory_lines'>

export type InventoryValuationResult = Tables<'inventory_valuation_results'>
export type InventoryValuationResultInsert = Inserts<'inventory_valuation_results'>

// ─── Inventory Snapshots ──────────────────────────────────────────────────────

export type SnapshotFilters = {
  status?: InventorySnapshot['status']
  snapshot_type?: InventorySnapshot['snapshot_type']
  from?: string
  to?: string
}

export async function listSnapshots(
  filters: SnapshotFilters = {},
  client: SupabaseServerClient
): Promise<InventorySnapshot[]> {
  let query = client.from('inventory_snapshots').select('*').order('snapshot_date', { ascending: false })
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.snapshot_type) query = query.eq('snapshot_type', filters.snapshot_type)
  if (filters.from) query = query.gte('snapshot_date', filters.from)
  if (filters.to) query = query.lte('snapshot_date', filters.to)
  const { data, error } = await query
  if (error) handleSupabaseError(error, 'listSnapshots', 'inventory_snapshots')
  return data ?? []
}

export async function findSnapshotById(
  id: string,
  client: SupabaseServerClient
): Promise<InventorySnapshot> {
  const { data, error } = await client.from('inventory_snapshots').select('*').eq('id', id).single()
  if (error) handleSupabaseError(error, 'findSnapshotById', 'inventory_snapshots')
  if (!data) throw new NotFoundError('InventorySnapshot', id)
  return data
}

export async function createSnapshot(
  input: InventorySnapshotInsert,
  client: SupabaseServerClient
): Promise<InventorySnapshot> {
  const { data, error } = await client.from('inventory_snapshots').insert(input).select().single()
  if (error) handleSupabaseError(error, 'createSnapshot', 'inventory_snapshots')
  if (!data) throw new Error('createSnapshot returned no data')
  return data
}

export async function updateSnapshot(
  id: string,
  input: InventorySnapshotUpdate,
  client: SupabaseServerClient
): Promise<InventorySnapshot> {
  const { data, error } = await client.from('inventory_snapshots').update(input).eq('id', id).select().single()
  if (error) handleSupabaseError(error, 'updateSnapshot', 'inventory_snapshots')
  if (!data) throw new NotFoundError('InventorySnapshot', id)
  return data
}

export async function approveSnapshot(
  id: string,
  approvedBy: string,
  client: SupabaseServerClient
): Promise<InventorySnapshot> {
  return updateSnapshot(id, {
    status: 'approved',
    approved_by: approvedBy,
    approved_at: new Date().toISOString(),
  }, client)
}

// ─── Inventory Lines ──────────────────────────────────────────────────────────

export async function listInventoryLines(
  snapshotId: string,
  client: SupabaseServerClient
): Promise<InventoryLine[]> {
  const { data, error } = await client
    .from('inventory_lines')
    .select('*')
    .eq('snapshot_id', snapshotId)
    .order('sku_id')
  if (error) handleSupabaseError(error, 'listInventoryLines', 'inventory_lines')
  return data ?? []
}

export async function listInventoryLinesWithMissingCost(
  snapshotId: string,
  client: SupabaseServerClient
): Promise<InventoryLine[]> {
  const { data, error } = await client
    .from('inventory_lines')
    .select('*')
    .eq('snapshot_id', snapshotId)
    .eq('has_missing_cost', true)
  if (error) handleSupabaseError(error, 'listInventoryLinesWithMissingCost', 'inventory_lines')
  return data ?? []
}

export async function upsertInventoryLines(
  lines: InventoryLineInsert[],
  client: SupabaseServerClient
): Promise<InventoryLine[]> {
  if (lines.length === 0) return []
  const { data, error } = await client
    .from('inventory_lines')
    .upsert(lines, { onConflict: 'snapshot_id,sku_id,warehouse_id' })
    .select()
  if (error) handleSupabaseError(error, 'upsertInventoryLines', 'inventory_lines')
  return data ?? []
}

export async function updateInventoryLine(
  id: string,
  input: InventoryLineUpdate,
  client: SupabaseServerClient
): Promise<InventoryLine> {
  const { data, error } = await client.from('inventory_lines').update(input).eq('id', id).select().single()
  if (error) handleSupabaseError(error, 'updateInventoryLine', 'inventory_lines')
  if (!data) throw new NotFoundError('InventoryLine', id)
  return data
}

// ─── Inventory Valuation Results (append-only) ───────────────────────────────

export async function listValuationResults(
  snapshotId: string,
  client: SupabaseServerClient
): Promise<InventoryValuationResult[]> {
  const { data, error } = await client
    .from('inventory_valuation_results')
    .select('*')
    .eq('snapshot_id', snapshotId)
  if (error) handleSupabaseError(error, 'listValuationResults', 'inventory_valuation_results')
  return data ?? []
}

export async function insertValuationResults(
  results: InventoryValuationResultInsert[],
  client: SupabaseServerClient
): Promise<InventoryValuationResult[]> {
  if (results.length === 0) return []
  const { data, error } = await client.from('inventory_valuation_results').insert(results).select()
  if (error) handleSupabaseError(error, 'insertValuationResults', 'inventory_valuation_results')
  return data ?? []
}

export async function countMissingCosts(
  snapshotId: string,
  client: SupabaseServerClient
): Promise<number> {
  const { count, error } = await client
    .from('inventory_lines')
    .select('id', { count: 'exact', head: true })
    .eq('snapshot_id', snapshotId)
    .eq('has_missing_cost', true)
  if (error) handleSupabaseError(error, 'countMissingCosts', 'inventory_lines')
  return count ?? 0
}
