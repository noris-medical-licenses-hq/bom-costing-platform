import type { SupabaseServerClient } from '../lib/supabase'
import type { Tables, Inserts, Updates } from '../types/database.generated'
import { handleSupabaseError, NotFoundError } from './base/errors'

export type Site = Tables<'sites'>
export type SiteInsert = Inserts<'sites'>
export type SiteUpdate = Updates<'sites'>

export type Warehouse = Tables<'warehouses'>
export type WarehouseInsert = Inserts<'warehouses'>
export type WarehouseUpdate = Updates<'warehouses'>

export type Project = Tables<'projects'>
export type ProjectInsert = Inserts<'projects'>
export type ProjectUpdate = Updates<'projects'>

// ─── Sites ───────────────────────────────────────────────────────────────────

export async function listSites(
  activeOnly = true,
  client: SupabaseServerClient
): Promise<Site[]> {
  let query = client.from('sites').select('*').order('name')
  if (activeOnly) query = query.eq('is_active', true)
  const { data, error } = await query
  if (error) handleSupabaseError(error, 'listSites', 'sites')
  return data ?? []
}

export async function findSiteById(id: string, client: SupabaseServerClient): Promise<Site> {
  const { data, error } = await client.from('sites').select('*').eq('id', id).single()
  if (error) handleSupabaseError(error, 'findSiteById', 'sites')
  if (!data) throw new NotFoundError('Site', id)
  return data
}

export async function createSite(input: SiteInsert, client: SupabaseServerClient): Promise<Site> {
  const { data, error } = await client.from('sites').insert(input).select().single()
  if (error) handleSupabaseError(error, 'createSite', 'sites')
  if (!data) throw new Error('createSite returned no data')
  return data
}

export async function updateSite(
  id: string,
  input: SiteUpdate,
  client: SupabaseServerClient
): Promise<Site> {
  const { data, error } = await client.from('sites').update(input).eq('id', id).select().single()
  if (error) handleSupabaseError(error, 'updateSite', 'sites')
  if (!data) throw new NotFoundError('Site', id)
  return data
}

// ─── Warehouses ──────────────────────────────────────────────────────────────

export async function listWarehouses(
  siteId: string | null,
  activeOnly = true,
  client: SupabaseServerClient
): Promise<Warehouse[]> {
  let query = client.from('warehouses').select('*').order('name')
  if (siteId) query = query.eq('site_id', siteId)
  if (activeOnly) query = query.eq('is_active', true)
  const { data, error } = await query
  if (error) handleSupabaseError(error, 'listWarehouses', 'warehouses')
  return data ?? []
}

export async function findWarehouseById(id: string, client: SupabaseServerClient): Promise<Warehouse> {
  const { data, error } = await client.from('warehouses').select('*').eq('id', id).single()
  if (error) handleSupabaseError(error, 'findWarehouseById', 'warehouses')
  if (!data) throw new NotFoundError('Warehouse', id)
  return data
}

export async function createWarehouse(
  input: WarehouseInsert,
  client: SupabaseServerClient
): Promise<Warehouse> {
  const { data, error } = await client.from('warehouses').insert(input).select().single()
  if (error) handleSupabaseError(error, 'createWarehouse', 'warehouses')
  if (!data) throw new Error('createWarehouse returned no data')
  return data
}

export async function updateWarehouse(
  id: string,
  input: WarehouseUpdate,
  client: SupabaseServerClient
): Promise<Warehouse> {
  const { data, error } = await client.from('warehouses').update(input).eq('id', id).select().single()
  if (error) handleSupabaseError(error, 'updateWarehouse', 'warehouses')
  if (!data) throw new NotFoundError('Warehouse', id)
  return data
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export async function listProjects(
  status: Project['status'] | null = 'active',
  client: SupabaseServerClient
): Promise<Project[]> {
  let query = client.from('projects').select('*').order('name')
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) handleSupabaseError(error, 'listProjects', 'projects')
  return data ?? []
}

export async function findProjectById(id: string, client: SupabaseServerClient): Promise<Project> {
  const { data, error } = await client.from('projects').select('*').eq('id', id).single()
  if (error) handleSupabaseError(error, 'findProjectById', 'projects')
  if (!data) throw new NotFoundError('Project', id)
  return data
}

export async function createProject(
  input: ProjectInsert,
  client: SupabaseServerClient
): Promise<Project> {
  const { data, error } = await client.from('projects').insert(input).select().single()
  if (error) handleSupabaseError(error, 'createProject', 'projects')
  if (!data) throw new Error('createProject returned no data')
  return data
}

export async function updateProject(
  id: string,
  input: ProjectUpdate,
  client: SupabaseServerClient
): Promise<Project> {
  const { data, error } = await client.from('projects').update(input).eq('id', id).select().single()
  if (error) handleSupabaseError(error, 'updateProject', 'projects')
  if (!data) throw new NotFoundError('Project', id)
  return data
}
