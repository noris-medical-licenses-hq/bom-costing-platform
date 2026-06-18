import type { SupabaseServerClient } from '../lib/supabase'
import type { Tables, Inserts, Updates } from '../types/database.generated'
import { handleSupabaseError, NotFoundError } from './base/errors'

export type Sku = Tables<'skus'>
export type SkuInsert = Inserts<'skus'>
export type SkuUpdate = Updates<'skus'>

export type SkuFilters = {
  status?: Sku['status']
  family_id?: string
  subfamily_id?: string
  item_type?: Sku['item_type']
  search?: string
}

export async function listSkus(filters: SkuFilters = {}, client: SupabaseServerClient): Promise<Sku[]> {
  let query = client.from('skus').select('*').order('part_number')
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.family_id) query = query.eq('family_id', filters.family_id)
  if (filters.subfamily_id) query = query.eq('subfamily_id', filters.subfamily_id)
  if (filters.item_type) query = query.eq('item_type', filters.item_type)
  if (filters.search) query = query.or(`part_number.ilike.%${filters.search}%,name.ilike.%${filters.search}%`)
  const { data, error } = await query
  if (error) handleSupabaseError(error, 'listSkus', 'skus')
  return data ?? []
}

export async function findSkuById(id: string, client: SupabaseServerClient): Promise<Sku> {
  const { data, error } = await client.from('skus').select('*').eq('id', id).single()
  if (error) handleSupabaseError(error, 'findSkuById', 'skus')
  if (!data) throw new NotFoundError('Sku', id)
  return data
}

export async function findSkuByPartNumber(partNumber: string, client: SupabaseServerClient): Promise<Sku | null> {
  const { data, error } = await client.from('skus').select('*').eq('part_number', partNumber).maybeSingle()
  if (error) handleSupabaseError(error, 'findSkuByPartNumber', 'skus')
  return data
}

export async function createSku(input: SkuInsert, client: SupabaseServerClient): Promise<Sku> {
  const { data, error } = await client.from('skus').insert(input).select().single()
  if (error) handleSupabaseError(error, 'createSku', 'skus')
  if (!data) throw new Error('createSku returned no data')
  return data
}

export async function updateSku(id: string, input: SkuUpdate, client: SupabaseServerClient): Promise<Sku> {
  const { data, error } = await client.from('skus').update(input).eq('id', id).select().single()
  if (error) handleSupabaseError(error, 'updateSku', 'skus')
  if (!data) throw new NotFoundError('Sku', id)
  return data
}

export async function archiveSku(id: string, client: SupabaseServerClient): Promise<Sku> {
  return updateSku(id, { status: 'archived' }, client)
}

// Returns all entity IDs that reference this SKU (for pre-archive warning, OQ-06).
export async function findSkuReferences(skuId: string, client: SupabaseServerClient): Promise<{
  activeBomLines: number
  supplierPrices: number
  costItems: number
  activeManualAdjustments: number
}> {
  const [bomLines, prices, costItems, adjustments] = await Promise.all([
    client.from('bom_lines').select('id', { count: 'exact', head: true }).eq('sku_id', skuId),
    client.from('supplier_prices').select('id', { count: 'exact', head: true }).eq('sku_id', skuId),
    client.from('cost_items').select('id', { count: 'exact', head: true }).eq('scope_id', skuId).eq('scope_type', 'sku'),
    client.from('manual_cost_adjustments').select('id', { count: 'exact', head: true }).eq('sku_id', skuId).eq('status', 'approved'),
  ])
  return {
    activeBomLines: bomLines.count ?? 0,
    supplierPrices: prices.count ?? 0,
    costItems: costItems.count ?? 0,
    activeManualAdjustments: adjustments.count ?? 0,
  }
}
