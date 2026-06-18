import type { SupabaseServerClient } from '../lib/supabase'
import type { Tables, Inserts } from '../types/database.generated'
import { handleSupabaseError, NotFoundError } from './base/errors'

export type Bom = Tables<'boms'>
export type BomVersion = Tables<'bom_versions'>
export type BomLine = Tables<'bom_lines'>

// ─── BOMs ────────────────────────────────────────────────────────────────────

export async function findBomBySku(skuId: string, client: SupabaseServerClient): Promise<Bom | null> {
  const { data, error } = await client.from('boms').select('*').eq('sku_id', skuId).maybeSingle()
  if (error) handleSupabaseError(error, 'findBomBySku', 'boms')
  return data
}

export async function createBom(input: Inserts<'boms'>, client: SupabaseServerClient): Promise<Bom> {
  const { data, error } = await client.from('boms').insert(input).select().single()
  if (error) handleSupabaseError(error, 'createBom', 'boms')
  if (!data) throw new Error('createBom returned no data')
  return data
}

// ─── BOM Versions ────────────────────────────────────────────────────────────

export async function listBomVersions(bomId: string, client: SupabaseServerClient): Promise<BomVersion[]> {
  const { data, error } = await client.from('bom_versions').select('*').eq('bom_id', bomId).order('version_number', { ascending: false })
  if (error) handleSupabaseError(error, 'listBomVersions', 'bom_versions')
  return data ?? []
}

export async function findApprovedBomVersion(bomId: string, client: SupabaseServerClient): Promise<BomVersion | null> {
  const { data, error } = await client.from('bom_versions').select('*').eq('bom_id', bomId).eq('status', 'approved').maybeSingle()
  if (error) handleSupabaseError(error, 'findApprovedBomVersion', 'bom_versions')
  return data
}

export async function findBomVersionById(id: string, client: SupabaseServerClient): Promise<BomVersion> {
  const { data, error } = await client.from('bom_versions').select('*').eq('id', id).single()
  if (error) handleSupabaseError(error, 'findBomVersionById', 'bom_versions')
  if (!data) throw new NotFoundError('BomVersion', id)
  return data
}

export async function createBomVersion(input: Inserts<'bom_versions'>, client: SupabaseServerClient): Promise<BomVersion> {
  const { data, error } = await client.from('bom_versions').insert(input).select().single()
  if (error) handleSupabaseError(error, 'createBomVersion', 'bom_versions')
  if (!data) throw new Error('createBomVersion returned no data')
  return data
}

export async function approveBomVersion(id: string, approvedBy: string, client: SupabaseServerClient): Promise<BomVersion> {
  const { data, error } = await client.from('bom_versions')
    .update({ status: 'approved', approved_by: approvedBy, approved_at: new Date().toISOString(), is_locked: true })
    .eq('id', id)
    .select().single()
  if (error) handleSupabaseError(error, 'approveBomVersion', 'bom_versions')
  if (!data) throw new NotFoundError('BomVersion', id)
  return data
}

// ─── BOM Lines ───────────────────────────────────────────────────────────────

export async function listBomLines(bomVersionId: string, client: SupabaseServerClient): Promise<BomLine[]> {
  const { data, error } = await client.from('bom_lines')
    .select('*')
    .eq('bom_version_id', bomVersionId)
    .order('depth').order('position')
  if (error) handleSupabaseError(error, 'listBomLines', 'bom_lines')
  return data ?? []
}

export async function createBomLine(input: Inserts<'bom_lines'>, client: SupabaseServerClient): Promise<BomLine> {
  const { data, error } = await client.from('bom_lines').insert(input).select().single()
  if (error) handleSupabaseError(error, 'createBomLine', 'bom_lines')
  if (!data) throw new Error('createBomLine returned no data')
  return data
}

export async function deleteBomLine(id: string, client: SupabaseServerClient): Promise<void> {
  const { error } = await client.from('bom_lines').delete().eq('id', id)
  if (error) handleSupabaseError(error, 'deleteBomLine', 'bom_lines')
}

// Returns the BOM tree as a flat array ordered by depth+position.
// Cycle detection must be run before inserting, not on read.
export async function loadBomTree(bomVersionId: string, client: SupabaseServerClient): Promise<BomLine[]> {
  return listBomLines(bomVersionId, client)
}
