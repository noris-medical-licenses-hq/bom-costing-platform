import type { SupabaseServerClient } from '../lib/supabase'
import type { Tables, Inserts, Updates } from '../types/database.generated'
import { handleSupabaseError, NotFoundError } from './base/errors'

export type Family = Tables<'families'>
export type FamilyInsert = Inserts<'families'>
export type FamilyUpdate = Updates<'families'>

export type Subfamily = Tables<'subfamilies'>
export type SubfamilyInsert = Inserts<'subfamilies'>
export type SubfamilyUpdate = Updates<'subfamilies'>

// ─── Families ────────────────────────────────────────────────────────────────

export async function listFamilies(
  activeOnly = true,
  client: SupabaseServerClient
): Promise<Family[]> {
  let query = client.from('families').select('*').order('name')
  if (activeOnly) query = query.eq('is_active', true)
  const { data, error } = await query
  if (error) handleSupabaseError(error, 'listFamilies', 'families')
  return data ?? []
}

export async function findFamilyById(id: string, client: SupabaseServerClient): Promise<Family> {
  const { data, error } = await client.from('families').select('*').eq('id', id).single()
  if (error) handleSupabaseError(error, 'findFamilyById', 'families')
  if (!data) throw new NotFoundError('Family', id)
  return data
}

export async function findFamilyByCode(code: string, client: SupabaseServerClient): Promise<Family | null> {
  const { data, error } = await client.from('families').select('*').eq('code', code).maybeSingle()
  if (error) handleSupabaseError(error, 'findFamilyByCode', 'families')
  return data
}

export async function createFamily(input: FamilyInsert, client: SupabaseServerClient): Promise<Family> {
  const { data, error } = await client.from('families').insert(input).select().single()
  if (error) handleSupabaseError(error, 'createFamily', 'families')
  if (!data) throw new Error('createFamily returned no data')
  return data
}

export async function updateFamily(
  id: string,
  input: FamilyUpdate,
  client: SupabaseServerClient
): Promise<Family> {
  const { data, error } = await client.from('families').update(input).eq('id', id).select().single()
  if (error) handleSupabaseError(error, 'updateFamily', 'families')
  if (!data) throw new NotFoundError('Family', id)
  return data
}

// ─── Subfamilies ─────────────────────────────────────────────────────────────

export async function listSubfamilies(
  familyId: string | null,
  activeOnly = true,
  client: SupabaseServerClient
): Promise<Subfamily[]> {
  let query = client.from('subfamilies').select('*').order('name')
  if (familyId) query = query.eq('family_id', familyId)
  if (activeOnly) query = query.eq('is_active', true)
  const { data, error } = await query
  if (error) handleSupabaseError(error, 'listSubfamilies', 'subfamilies')
  return data ?? []
}

export async function findSubfamilyById(id: string, client: SupabaseServerClient): Promise<Subfamily> {
  const { data, error } = await client.from('subfamilies').select('*').eq('id', id).single()
  if (error) handleSupabaseError(error, 'findSubfamilyById', 'subfamilies')
  if (!data) throw new NotFoundError('Subfamily', id)
  return data
}

export async function createSubfamily(
  input: SubfamilyInsert,
  client: SupabaseServerClient
): Promise<Subfamily> {
  const { data, error } = await client.from('subfamilies').insert(input).select().single()
  if (error) handleSupabaseError(error, 'createSubfamily', 'subfamilies')
  if (!data) throw new Error('createSubfamily returned no data')
  return data
}

export async function updateSubfamily(
  id: string,
  input: SubfamilyUpdate,
  client: SupabaseServerClient
): Promise<Subfamily> {
  const { data, error } = await client.from('subfamilies').update(input).eq('id', id).select().single()
  if (error) handleSupabaseError(error, 'updateSubfamily', 'subfamilies')
  if (!data) throw new NotFoundError('Subfamily', id)
  return data
}
