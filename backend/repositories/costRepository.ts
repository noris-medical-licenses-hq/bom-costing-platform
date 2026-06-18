import type { SupabaseServerClient } from '../lib/supabase'
import type { Tables, Inserts } from '../types/database.generated'
import { handleSupabaseError, NotFoundError } from './base/errors'

export type CostSet = Tables<'cost_sets'>
export type CostItem = Tables<'cost_items'>
export type ManualCostAdjustment = Tables<'manual_cost_adjustments'>

// ─── Cost Sets ───────────────────────────────────────────────────────────────

export async function listCostSets(client: SupabaseServerClient): Promise<CostSet[]> {
  const { data, error } = await client.from('cost_sets').select('*').order('created_at', { ascending: false })
  if (error) handleSupabaseError(error, 'listCostSets', 'cost_sets')
  return data ?? []
}

export async function findCostSetById(id: string, client: SupabaseServerClient): Promise<CostSet> {
  const { data, error } = await client.from('cost_sets').select('*').eq('id', id).single()
  if (error) handleSupabaseError(error, 'findCostSetById', 'cost_sets')
  if (!data) throw new NotFoundError('CostSet', id)
  return data
}

export async function createCostSet(input: Inserts<'cost_sets'>, client: SupabaseServerClient): Promise<CostSet> {
  const { data, error } = await client.from('cost_sets').insert(input).select().single()
  if (error) handleSupabaseError(error, 'createCostSet', 'cost_sets')
  if (!data) throw new Error('createCostSet returned no data')
  return data
}

export async function lockCostSet(id: string, client: SupabaseServerClient): Promise<CostSet> {
  const { data, error } = await client.from('cost_sets').update({ is_locked: true }).eq('id', id).select().single()
  if (error) handleSupabaseError(error, 'lockCostSet', 'cost_sets')
  if (!data) throw new NotFoundError('CostSet', id)
  return data
}

// ─── Cost Items ──────────────────────────────────────────────────────────────

export async function listCostItems(costSetId: string, client: SupabaseServerClient): Promise<CostItem[]> {
  const { data, error } = await client.from('cost_items').select('*').eq('cost_set_id', costSetId)
  if (error) handleSupabaseError(error, 'listCostItems', 'cost_items')
  return data ?? []
}

export async function createCostItem(input: Inserts<'cost_items'>, client: SupabaseServerClient): Promise<CostItem> {
  const { data, error } = await client.from('cost_items').insert(input).select().single()
  if (error) handleSupabaseError(error, 'createCostItem', 'cost_items')
  if (!data) throw new Error('createCostItem returned no data')
  return data
}

// Resolves the cost item for a SKU using the 6-level precedence hierarchy.
// Returns the matching cost_item and the precedence level used (1-6), or null if none found.
// Called by the cost engine Stage 04.
export async function resolveCostItemForSku(
  skuId: string,
  subfamilyId: string | null,
  familyId: string | null,
  defaultSupplierId: string | null,
  supplierCountry: string | null,
  costSetId: string,
  itemType: CostItem['item_type'],
  client: SupabaseServerClient
): Promise<{ item: CostItem; precedenceLevel: 1 | 2 | 3 | 4 | 5 | 6 } | null> {
  const { data: items, error } = await client.from('cost_items')
    .select('*')
    .eq('cost_set_id', costSetId)
    .eq('item_type', itemType)
    .or([
      `scope_type.eq.sku,scope_id.eq.${skuId}`,
      subfamilyId ? `scope_type.eq.subfamily,scope_id.eq.${subfamilyId}` : null,
      familyId ? `scope_type.eq.family,scope_id.eq.${familyId}` : null,
      defaultSupplierId && supplierCountry ? `scope_type.eq.supplier_country,scope_id.eq.${defaultSupplierId}` : null,
      'scope_type.eq.global',
    ].filter(Boolean).join(','))

  if (error) handleSupabaseError(error, 'resolveCostItemForSku', 'cost_items')
  if (!items || items.length === 0) return null

  // Apply precedence hierarchy: sku(1) > subfamily(2) > family(3) > supplier_country(4) > global(5)
  const precedence: Array<[CostItem['scope_type'], 1 | 2 | 3 | 4 | 5]> = [
    ['sku', 1],
    ['subfamily', 2],
    ['family', 3],
    ['supplier_country', 4],
    ['global', 5],
  ]
  for (const [scopeType, level] of precedence) {
    const match = items.find(i => i.scope_type === scopeType)
    if (match) return { item: match, precedenceLevel: level }
  }
  return null
}

// Finds the most cost-effective current supplier price for a SKU (Level 6 fallback).
// Prefers the SKU's default_supplier_id, then falls back to any active supplier's current price.
export async function findBestSupplierPrice(
  skuId: string,
  defaultSupplierId: string | null,
  valuationDate: string,
  client: SupabaseServerClient
): Promise<{ id: string; unit_price: number; currency: string; supplier_id: string } | null> {
  let query = client.from('supplier_prices')
    .select('id, unit_price, currency, supplier_id')
    .eq('sku_id', skuId)
    .lte('effective_from', valuationDate)
    .or('effective_to.is.null,effective_to.gte.' + valuationDate)
    .order('unit_price', { ascending: true })
    .limit(10)

  const { data, error } = await query
  if (error) handleSupabaseError(error, 'findBestSupplierPrice', 'supplier_prices')
  if (!data || data.length === 0) return null

  // Prefer default supplier if available
  if (defaultSupplierId) {
    const preferred = data.find(p => p.supplier_id === defaultSupplierId)
    if (preferred) return preferred
  }
  return data[0] ?? null
}

// ─── Manual Cost Adjustments ─────────────────────────────────────────────────

export async function findActiveManualAdjustment(
  skuId: string,
  costSetId: string,
  client: SupabaseServerClient
): Promise<ManualCostAdjustment | null> {
  const { data, error } = await client.from('manual_cost_adjustments')
    .select('*')
    .eq('sku_id', skuId)
    .eq('cost_set_id', costSetId)
    .eq('status', 'approved')
    .maybeSingle()
  if (error) handleSupabaseError(error, 'findActiveManualAdjustment', 'manual_cost_adjustments')
  return data
}

export async function createManualAdjustment(
  input: Inserts<'manual_cost_adjustments'>,
  client: SupabaseServerClient
): Promise<ManualCostAdjustment> {
  const { data, error } = await client.from('manual_cost_adjustments').insert(input).select().single()
  if (error) handleSupabaseError(error, 'createManualAdjustment', 'manual_cost_adjustments')
  if (!data) throw new Error('createManualAdjustment returned no data')
  return data
}

export async function approveManualAdjustment(
  id: string,
  approvedBy: string,
  client: SupabaseServerClient
): Promise<ManualCostAdjustment> {
  const { data, error } = await client.from('manual_cost_adjustments')
    .update({ status: 'approved', approved_by: approvedBy, approved_at: new Date().toISOString() })
    .eq('id', id).select().single()
  if (error) handleSupabaseError(error, 'approveManualAdjustment', 'manual_cost_adjustments')
  if (!data) throw new NotFoundError('ManualCostAdjustment', id)
  return data
}
