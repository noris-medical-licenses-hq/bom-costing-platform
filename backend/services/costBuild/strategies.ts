// Cost Resolution Strategy Registry
// Each strategy is a pure async function: (skuId, ctx) → StrategyResult | null
// null means "this strategy cannot produce a cost for this SKU" — triggers fallback.
//
// To add a new strategy (STANDARD_COST, CONTRACT_PRICE, etc.):
//   1. Write the function below
//   2. Register it in STRATEGY_REGISTRY
//   No schema changes required.

export interface StrategyResult {
  resolvedCost:     number
  currency:         string
  sourceRecordType: string
  sourceRecordId:   string | null
  sourceReference:  string
}

export interface BuildStrategyContext {
  orgId:          string
  siteId:         string
  costSetId:      string
  db:             any  // service Supabase client (already cast)
  valuationDate:  string
}

export type StrategyFn = (
  skuId: string,
  ctx:   BuildStrategyContext
) => Promise<StrategyResult | null>

// ── PRICE_LIST ────────────────────────────────────────────────────────────────
// Cheapest active supplier price as of the valuation date.
// Prefers default_supplier_id if one is set.
const priceListStrategy: StrategyFn = async (skuId, ctx) => {
  const { data: sku } = await ctx.db
    .from('skus')
    .select('default_supplier_id')
    .eq('id', skuId)
    .maybeSingle()

  const { data: prices } = await ctx.db
    .from('supplier_prices')
    .select('id, unit_price, currency, supplier_id, suppliers(name, code)')
    .eq('sku_id', skuId)
    .lte('effective_from', ctx.valuationDate)
    .or(`effective_to.is.null,effective_to.gte.${ctx.valuationDate}`)
    .order('unit_price', { ascending: true })

  if (!prices?.length) return null

  const defaultId = sku?.default_supplier_id ?? null
  const preferred = defaultId ? prices.find((p: any) => p.supplier_id === defaultId) : null
  const sp = preferred ?? prices[0]
  const supName: string = (sp.suppliers as any)?.name ?? sp.supplier_id

  return {
    resolvedCost:     Number(sp.unit_price),
    currency:         sp.currency,
    sourceRecordType: 'supplier_price',
    sourceRecordId:   sp.id,
    sourceReference:  `Supplier: ${supName} — ${sp.unit_price} ${sp.currency}`,
  }
}

// ── LAST_PURCHASE ─────────────────────────────────────────────────────────────
// Stubbed: purchase order history not yet in schema.
// Returns null to trigger fallback to PRICE_LIST.
const lastPurchaseStrategy: StrategyFn = async () => null

// ── AVERAGE_PURCHASE ──────────────────────────────────────────────────────────
// Stubbed: purchase order history not yet in schema.
const averagePurchaseStrategy: StrategyFn = async () => null

// ── MANUAL_OVERRIDE ───────────────────────────────────────────────────────────
// Stubbed: would read from a manual-override table.
const manualOverrideStrategy: StrategyFn = async () => null

// ── STANDARD_COST ─────────────────────────────────────────────────────────────
// Stubbed for future implementation.
const standardCostStrategy: StrategyFn = async () => null

// ── CONTRACT_PRICE ────────────────────────────────────────────────────────────
// Stubbed for future implementation.
const contractPriceStrategy: StrategyFn = async () => null

// ── CUSTOMER_SPECIFIC_COST ────────────────────────────────────────────────────
// Stubbed for future implementation.
const customerSpecificCostStrategy: StrategyFn = async () => null

// ─── Registry ────────────────────────────────────────────────────────────────

export const STRATEGY_REGISTRY: Record<string, StrategyFn> = {
  PRICE_LIST:             priceListStrategy,
  LAST_PURCHASE:          lastPurchaseStrategy,
  AVERAGE_PURCHASE:       averagePurchaseStrategy,
  MANUAL_OVERRIDE:        manualOverrideStrategy,
  STANDARD_COST:          standardCostStrategy,
  CONTRACT_PRICE:         contractPriceStrategy,
  CUSTOMER_SPECIFIC_COST: customerSpecificCostStrategy,
}

// ─── Default fallback chains per item_cost_type ───────────────────────────────
// BOM_ROLLUP is handled specially by the engine (recursive rollup, not registry).

export const DEFAULT_FALLBACK_CHAINS: Record<string, string[]> = {
  PURCHASED:    ['PRICE_LIST', 'LAST_PURCHASE', 'AVERAGE_PURCHASE'],
  MANUFACTURED: ['BOM_ROLLUP'],
  MAKE_OR_BUY:  ['BOM_ROLLUP', 'LAST_PURCHASE', 'PRICE_LIST'],
  SERVICE:      ['PRICE_LIST', 'MANUAL_OVERRIDE'],
  MANUAL:       ['MANUAL_OVERRIDE', 'PRICE_LIST'],
}

// Determine the effective strategy chain for a given SKU, considering:
// 1. sku_cost_overrides for this site (highest priority)
// 2. default_strategy from the Cost Build
// 3. DEFAULT_FALLBACK_CHAINS for the item_cost_type
export function resolveStrategyChain(
  itemCostType: string,
  defaultStrategy: string,
  override: { preferred_strategy: string; fallback_strategies: string[] } | null
): string[] {
  if (override) {
    const chain = [override.preferred_strategy, ...(override.fallback_strategies as string[])]
    return chain.filter(s => typeof s === 'string' && s.length > 0)
  }

  // If default_strategy matches a sensible anchor for this item_cost_type, use it
  if (defaultStrategy === 'BOM_ROLLUP' && itemCostType === 'PURCHASED') {
    return DEFAULT_FALLBACK_CHAINS['PURCHASED']
  }
  if (defaultStrategy === 'PRICE_LIST' && itemCostType === 'MANUFACTURED') {
    return DEFAULT_FALLBACK_CHAINS['MANUFACTURED']
  }

  // For MAKE_OR_BUY: always try BOM first regardless of site default
  if (itemCostType === 'MAKE_OR_BUY') {
    return DEFAULT_FALLBACK_CHAINS['MAKE_OR_BUY']
  }

  // Default: use site strategy as anchor, then type defaults as fallback
  const typeChain = DEFAULT_FALLBACK_CHAINS[itemCostType] ?? ['PRICE_LIST']
  if (!typeChain.includes(defaultStrategy)) {
    return [defaultStrategy, ...typeChain]
  }
  return typeChain
}
