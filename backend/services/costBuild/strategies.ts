// Cost Resolution Strategy Registry
// Each strategy is a pure async function: (skuId, ctx) → StrategyResult | null
// null means "this strategy cannot produce a cost for this SKU" — triggers fallback.
//
// Operational status:
//   fully_operational  — reads live data, returns real costs in production
//   placeholder        — always returns null; hidden from production UI
//
// To add a new strategy: write the function, register in STRATEGY_REGISTRY,
// update STRATEGY_STATUS_MATRIX. No schema changes required.

export interface StrategyResult {
  resolvedCost:     number
  currency:         string
  sourceRecordType: string
  sourceRecordId:   string | null
  sourceReference:  string
}

export interface BuildStrategyContext {
  orgId:                       string
  siteId:                      string
  costSetId:                   string
  db:                          any  // service Supabase client (already cast)
  valuationDate:               string
  priceListVersionId:          string | null  // set at build start; null if no price list for site's country
  buildCurrency:               string  // cost set base currency; AVERAGE_PURCHASE filters by this
  averagePurchaseLookbackDays: number  // frozen into parameters_snapshot for reproducibility
}

export type StrategyFn = (
  skuId: string,
  ctx:   BuildStrategyContext
) => Promise<StrategyResult | null>

// ── PRICE_LIST ────────────────────────────────────────────────────────────────
// Reads unit price from the price_list_version linked to this Cost Build.
// Version is resolved at build start: latest active version for the site's country,
// or a specific version pinned by the user.
const priceListStrategy: StrategyFn = async (skuId, ctx) => {
  if (!ctx.priceListVersionId) return null

  const { data } = await ctx.db
    .from('price_list_version_items')
    .select('id, unit_price, currency, price_list_versions(version_number, country_price_lists(name, country_code))')
    .eq('price_list_version_id', ctx.priceListVersionId)
    .eq('sku_id', skuId)
    .maybeSingle()

  if (!data) return null

  const version  = (data.price_list_versions as any)?.version_number ?? '?'
  const listName = (data.price_list_versions as any)?.country_price_lists?.name ?? 'Price List'
  const country  = (data.price_list_versions as any)?.country_price_lists?.country_code ?? ''

  return {
    resolvedCost:     Number(data.unit_price),
    currency:         data.currency,
    sourceRecordType: 'price_list_version',
    sourceRecordId:   ctx.priceListVersionId,
    sourceReference:  `${listName} (${country}) v${version} — ${data.unit_price} ${data.currency}`,
  }
}

// ── LAST_PURCHASE ─────────────────────────────────────────────────────────────
// Fetches the single most recent purchase_history record for this SKU at this site
// with unit_cost > 0. Site-scoped for accurate per-site costing.
const lastPurchaseStrategy: StrategyFn = async (skuId, ctx) => {
  const { data } = await ctx.db
    .from('purchase_history')
    .select('id, unit_cost, currency, purchase_date, source_reference, source_system, suppliers(name, code)')
    .eq('organization_id', ctx.orgId)
    .eq('sku_id', skuId)
    .eq('site_id', ctx.siteId)
    .gt('unit_cost', 0)
    .order('purchase_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null

  const supplier = (data.suppliers as any)?.name ?? null
  const ref = data.source_reference ?? data.source_system ?? null
  const parts = [ref, supplier, data.purchase_date, `${data.unit_cost} ${data.currency}`].filter(Boolean)

  return {
    resolvedCost:     Number(data.unit_cost),
    currency:         data.currency,
    sourceRecordType: 'purchase_history',
    sourceRecordId:   data.id,
    sourceReference:  parts.join(' | '),
  }
}

// ── AVERAGE_PURCHASE ──────────────────────────────────────────────────────────
// Weighted average cost over ctx.averagePurchaseLookbackDays, filtered to records
// matching ctx.buildCurrency only. Cross-currency mixing is not performed — FX
// conversion is a future phase. Excluded records are counted and shown in the trace.
const averagePurchaseStrategy: StrategyFn = async (skuId, ctx) => {
  const cutoff = new Date(Date.now() - ctx.averagePurchaseLookbackDays * 86_400_000)
    .toISOString()
    .slice(0, 10)

  // Load all non-zero cost records in the lookback window for this SKU+site
  const { data } = await ctx.db
    .from('purchase_history')
    .select('unit_cost, quantity, currency')
    .eq('organization_id', ctx.orgId)
    .eq('sku_id', skuId)
    .eq('site_id', ctx.siteId)
    .gt('unit_cost', 0)
    .gte('purchase_date', cutoff)

  if (!data || data.length === 0) return null

  const included = data.filter((r: any) => r.currency === ctx.buildCurrency)
  const excluded = data.length - included.length

  if (included.length === 0) return null

  let totalValue = 0
  let totalQty   = 0
  for (const r of included as Array<{ unit_cost: number; quantity: number }>) {
    totalValue += Number(r.unit_cost) * Number(r.quantity)
    totalQty   += Number(r.quantity)
  }
  if (totalQty === 0) return null

  const avg = totalValue / totalQty

  // Count distinct excluded currencies for the trace
  const excCurrencies = excluded > 0
    ? [...new Set((data as Array<{ currency: string }>)
        .filter(r => r.currency !== ctx.buildCurrency)
        .map(r => r.currency))]
      .join('/')
    : null

  const refParts = [
    `${ctx.averagePurchaseLookbackDays}d avg ${avg.toFixed(4)} ${ctx.buildCurrency}`,
    `${included.length} records used`,
    excluded > 0 ? `${excluded} excluded (${excCurrencies})` : null,
  ].filter(Boolean)

  return {
    resolvedCost:     avg,
    currency:         ctx.buildCurrency,
    sourceRecordType: 'purchase_history',
    sourceRecordId:   null,
    sourceReference:  refParts.join(' | '),
  }
}

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

// ─── Operational status matrix ────────────────────────────────────────────────

export type StrategyStatus = 'fully_operational' | 'partially_operational' | 'placeholder'

export interface StrategyMeta {
  label:         string
  status:        StrategyStatus
  sourceTables:  string[]
  fallbackChain: string[]
  description:   string
  notesForUI:    string
}

export const STRATEGY_STATUS_MATRIX: Record<string, StrategyMeta> = {
  PRICE_LIST: {
    label:         'Price List',
    status:        'fully_operational',
    sourceTables:  ['country_price_lists', 'price_list_versions', 'price_list_version_items'],
    fallbackChain: ['LAST_PURCHASE', 'AVERAGE_PURCHASE'],
    description:   'Reads unit price from the country price list version linked to the Cost Build.',
    notesForUI:    'Requires an imported price list for the site country.',
  },
  BOM_ROLLUP: {
    label:         'BOM Rollup',
    status:        'fully_operational',
    sourceTables:  ['boms', 'bom_versions', 'bom_lines', 'virtual_components'],
    fallbackChain: [],
    description:   'Recursively rolls up component costs using the latest approved BOM version.',
    notesForUI:    'Requires approved BOMs for all manufactured assemblies.',
  },
  LAST_PURCHASE: {
    label:         'Last Purchase',
    status:        'fully_operational',
    sourceTables:  ['purchase_history'],
    fallbackChain: ['PRICE_LIST'],
    description:   'Uses the most recent ERP purchase price for this SKU at this site.',
    notesForUI:    'Requires purchase history imported from your ERP. Falls back to Price List if no history.',
  },
  AVERAGE_PURCHASE: {
    label:         'Average Purchase',
    status:        'fully_operational',
    sourceTables:  ['purchase_history'],
    fallbackChain: ['PRICE_LIST'],
    description:   'Weighted average purchase price over configurable lookback window, filtered by build currency.',
    notesForUI:    'Requires purchase history imported from your ERP. Lookback window and currency set at build creation.',
  },
  MANUAL_OVERRIDE: {
    label:         'Manual Override',
    status:        'placeholder',
    sourceTables:  ['sku_cost_overrides'],
    fallbackChain: ['PRICE_LIST'],
    description:   'Uses manually entered cost per SKU per site.',
    notesForUI:    'Not operational — override read logic not yet wired.',
  },
  STANDARD_COST: {
    label:         'Standard Cost',
    status:        'placeholder',
    sourceTables:  ['standard_costs'],
    fallbackChain: ['PRICE_LIST'],
    description:   'Uses a pre-defined annual standard cost per SKU.',
    notesForUI:    'Not operational — standard_costs table not yet in schema.',
  },
  CONTRACT_PRICE: {
    label:         'Contract Price',
    status:        'placeholder',
    sourceTables:  ['contracts', 'contract_lines'],
    fallbackChain: ['PRICE_LIST'],
    description:   'Uses supplier contract pricing active on the valuation date.',
    notesForUI:    'Not operational — contracts table not yet in schema.',
  },
  CUSTOMER_SPECIFIC_COST: {
    label:         'Customer-Specific Cost',
    status:        'placeholder',
    sourceTables:  ['customer_contracts', 'customer_price_lines'],
    fallbackChain: ['PRICE_LIST'],
    description:   'Uses cost from a customer-specific pricing agreement.',
    notesForUI:    'Not operational — customer contracts not yet in schema.',
  },
}

// Strategies safe to expose in the Cost Build creation UI (production-ready only).
export const OPERATIONAL_STRATEGIES = Object.entries(STRATEGY_STATUS_MATRIX)
  .filter(([, meta]) => meta.status === 'fully_operational')
  .map(([key, meta]) => ({ value: key, label: meta.label, desc: meta.description }))

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
