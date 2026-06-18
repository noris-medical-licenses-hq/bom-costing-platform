import type { SupabaseServerClient } from '../lib/supabase'
import type { Tables, Inserts, Updates } from '../types/database.generated'
import { handleSupabaseError, NotFoundError } from './base/errors'

export type Supplier = Tables<'suppliers'>
export type SupplierInsert = Inserts<'suppliers'>
export type SupplierUpdate = Updates<'suppliers'>

export type SupplierPrice = Tables<'supplier_prices'>
export type SupplierPriceInsert = Inserts<'supplier_prices'>
export type SupplierPriceUpdate = Updates<'supplier_prices'>

export type VirtualComponent = Tables<'virtual_components'>
export type VirtualComponentInsert = Inserts<'virtual_components'>
export type VirtualComponentUpdate = Updates<'virtual_components'>

// ─── Suppliers ───────────────────────────────────────────────────────────────

export async function listSuppliers(
  status: Supplier['status'] | null = 'active',
  client: SupabaseServerClient
): Promise<Supplier[]> {
  let query = client.from('suppliers').select('*').order('name')
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) handleSupabaseError(error, 'listSuppliers', 'suppliers')
  return data ?? []
}

export async function findSupplierById(id: string, client: SupabaseServerClient): Promise<Supplier> {
  const { data, error } = await client.from('suppliers').select('*').eq('id', id).single()
  if (error) handleSupabaseError(error, 'findSupplierById', 'suppliers')
  if (!data) throw new NotFoundError('Supplier', id)
  return data
}

export async function createSupplier(
  input: SupplierInsert,
  client: SupabaseServerClient
): Promise<Supplier> {
  const { data, error } = await client.from('suppliers').insert(input).select().single()
  if (error) handleSupabaseError(error, 'createSupplier', 'suppliers')
  if (!data) throw new Error('createSupplier returned no data')
  return data
}

export async function updateSupplier(
  id: string,
  input: SupplierUpdate,
  client: SupabaseServerClient
): Promise<Supplier> {
  const { data, error } = await client.from('suppliers').update(input).eq('id', id).select().single()
  if (error) handleSupabaseError(error, 'updateSupplier', 'suppliers')
  if (!data) throw new NotFoundError('Supplier', id)
  return data
}

// ─── Supplier Prices ─────────────────────────────────────────────────────────

export async function listSupplierPrices(
  skuId: string,
  client: SupabaseServerClient
): Promise<SupplierPrice[]> {
  const { data, error } = await client
    .from('supplier_prices')
    .select('*')
    .eq('sku_id', skuId)
    .order('effective_from', { ascending: false })
  if (error) handleSupabaseError(error, 'listSupplierPrices', 'supplier_prices')
  return data ?? []
}

export async function listCurrentSupplierPrices(
  skuId: string,
  asOfDate: string,
  client: SupabaseServerClient
): Promise<SupplierPrice[]> {
  const { data, error } = await client
    .from('supplier_prices')
    .select('*')
    .eq('sku_id', skuId)
    .lte('effective_from', asOfDate)
    .or(`effective_to.is.null,effective_to.gte.${asOfDate}`)
    .order('unit_price', { ascending: true })
  if (error) handleSupabaseError(error, 'listCurrentSupplierPrices', 'supplier_prices')
  return data ?? []
}

export async function createSupplierPrice(
  input: SupplierPriceInsert,
  client: SupabaseServerClient
): Promise<SupplierPrice> {
  const { data, error } = await client.from('supplier_prices').insert(input).select().single()
  if (error) handleSupabaseError(error, 'createSupplierPrice', 'supplier_prices')
  if (!data) throw new Error('createSupplierPrice returned no data')
  return data
}

export async function updateSupplierPrice(
  id: string,
  input: SupplierPriceUpdate,
  client: SupabaseServerClient
): Promise<SupplierPrice> {
  const { data, error } = await client.from('supplier_prices').update(input).eq('id', id).select().single()
  if (error) handleSupabaseError(error, 'updateSupplierPrice', 'supplier_prices')
  if (!data) throw new NotFoundError('SupplierPrice', id)
  return data
}

// ─── Virtual Components ───────────────────────────────────────────────────────

export async function listVirtualComponents(
  activeOnly = true,
  client: SupabaseServerClient
): Promise<VirtualComponent[]> {
  let query = client.from('virtual_components').select('*').order('name')
  if (activeOnly) query = query.eq('is_active', true)
  const { data, error } = await query
  if (error) handleSupabaseError(error, 'listVirtualComponents', 'virtual_components')
  return data ?? []
}

export async function findVirtualComponentById(
  id: string,
  client: SupabaseServerClient
): Promise<VirtualComponent> {
  const { data, error } = await client.from('virtual_components').select('*').eq('id', id).single()
  if (error) handleSupabaseError(error, 'findVirtualComponentById', 'virtual_components')
  if (!data) throw new NotFoundError('VirtualComponent', id)
  return data
}

export async function createVirtualComponent(
  input: VirtualComponentInsert,
  client: SupabaseServerClient
): Promise<VirtualComponent> {
  const { data, error } = await client.from('virtual_components').insert(input).select().single()
  if (error) handleSupabaseError(error, 'createVirtualComponent', 'virtual_components')
  if (!data) throw new Error('createVirtualComponent returned no data')
  return data
}

export async function updateVirtualComponent(
  id: string,
  input: VirtualComponentUpdate,
  client: SupabaseServerClient
): Promise<VirtualComponent> {
  const { data, error } = await client.from('virtual_components').update(input).eq('id', id).select().single()
  if (error) handleSupabaseError(error, 'updateVirtualComponent', 'virtual_components')
  if (!data) throw new NotFoundError('VirtualComponent', id)
  return data
}
