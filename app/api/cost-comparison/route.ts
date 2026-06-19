import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/backend/lib/supabase'
import { STRATEGY_REGISTRY, STRATEGY_STATUS_MATRIX } from '@/backend/services/costBuild/strategies'
import type { BuildStrategyContext, StrategyResult } from '@/backend/services/costBuild/strategies'

const OPERATIONAL = new Set(
  Object.entries(STRATEGY_STATUS_MATRIX)
    .filter(([, m]) => m.status === 'fully_operational')
    .map(([k]) => k)
)

const CompareSchema = z.object({
  siteId:                      z.string().uuid(),
  skuId:                       z.string().uuid(),
  strategies:                  z.array(z.string()).min(1).max(4),
  buildCurrency:               z.string().length(3).default('EUR'),
  averagePurchaseLookbackDays: z.number().int().refine(v => [30, 90, 180, 365, 730].includes(v)).default(365),
  priceListVersionId:          z.string().uuid().optional(),
})

export interface ComparisonRow {
  strategy:         string
  strategyLabel:    string
  cost:             number | null
  currency:         string | null
  sourceReference:  string | null
  sourceRecordType: string | null
  sourceRecordId:   string | null
  status:           'ok' | 'missing' | 'zero' | 'currency_mismatch' | 'not_operational'
  statusNote:       string | null
}

export interface ComparisonResult {
  skuId:                      string
  siteId:                     string
  buildCurrency:              string
  averagePurchaseLookbackDays: number
  rows:                       ComparisonRow[]
  lowestCost:                 number | null
  highestCost:                number | null
  currencyMismatch:           boolean
  runAt:                      string
}

export async function POST(request: NextRequest) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const orgIdResult = await (client as any).rpc('auth_org_id').maybeSingle()
    const orgId = (orgIdResult.data as string | null) ?? ''
    if (!orgId) return NextResponse.json({ error: 'No organization found' }, { status: 403 })

    const body = await request.json()
    const parsed = CompareSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
    }

    const { siteId, skuId, strategies, buildCurrency, averagePurchaseLookbackDays, priceListVersionId } = parsed.data

    // Verify SKU and site belong to this org
    const db = createServiceSupabaseClient() as any
    const [{ data: sku }, { data: site }] = await Promise.all([
      db.from('skus').select('id, part_number, name').eq('id', skuId).eq('organization_id', orgId).maybeSingle(),
      db.from('sites').select('id, name, code').eq('id', siteId).eq('organization_id', orgId).maybeSingle(),
    ])
    if (!sku) return NextResponse.json({ error: 'SKU not found' }, { status: 404 })
    if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 })

    // Resolve price list version if not provided (latest active for site's country)
    let resolvedPriceListVersionId = priceListVersionId ?? null
    if (!resolvedPriceListVersionId && strategies.includes('PRICE_LIST')) {
      const { data: siteDetail } = await db.from('sites').select('country').eq('id', siteId).single()
      if (siteDetail?.country) {
        const { data: plv } = await db
          .from('price_list_versions')
          .select('id')
          .eq('organization_id', orgId)
          .eq('status', 'active')
          .in('price_list_id',
            db.from('country_price_lists').select('id').eq('organization_id', orgId).eq('country_code', siteDetail.country)
          )
          .order('version_number', { ascending: false })
          .limit(1)
          .maybeSingle()
        resolvedPriceListVersionId = plv?.id ?? null
      }
    }

    // Shared context — costSetId is unused in comparison mode (no build created)
    const ctx: BuildStrategyContext = {
      orgId,
      siteId,
      costSetId:                   'comparison',
      db,
      valuationDate:               new Date().toISOString().slice(0, 10),
      priceListVersionId:          resolvedPriceListVersionId,
      buildCurrency,
      averagePurchaseLookbackDays,
    }

    // Run each requested strategy
    const rows: ComparisonRow[] = await Promise.all(
      strategies.map(async (strategy): Promise<ComparisonRow> => {
        const meta = STRATEGY_STATUS_MATRIX[strategy]
        const label = meta?.label ?? strategy

        if (!meta || !OPERATIONAL.has(strategy)) {
          return {
            strategy, strategyLabel: label, cost: null, currency: null,
            sourceReference: null, sourceRecordType: null, sourceRecordId: null,
            status: 'not_operational',
            statusNote: meta ? `Strategy "${label}" is not yet operational.` : `Unknown strategy "${strategy}".`,
          }
        }

        const fn = STRATEGY_REGISTRY[strategy]
        let result: StrategyResult | null = null
        try {
          result = await fn(skuId, ctx)
        } catch (err) {
          return {
            strategy, strategyLabel: label, cost: null, currency: null,
            sourceReference: null, sourceRecordType: null, sourceRecordId: null,
            status: 'missing',
            statusNote: `Strategy execution error: ${(err as Error).message}`,
          }
        }

        if (!result) {
          return {
            strategy, strategyLabel: label, cost: null, currency: null,
            sourceReference: null, sourceRecordType: null, sourceRecordId: null,
            status: 'missing',
            statusNote: `No ${label} data available for this SKU at this site.`,
          }
        }

        const currencyMismatch = result.currency !== buildCurrency
        const isZero = result.resolvedCost === 0

        return {
          strategy,
          strategyLabel:    label,
          cost:             result.resolvedCost,
          currency:         result.currency,
          sourceReference:  result.sourceReference,
          sourceRecordType: result.sourceRecordType,
          sourceRecordId:   result.sourceRecordId,
          status:           isZero ? 'zero' : currencyMismatch ? 'currency_mismatch' : 'ok',
          statusNote:       isZero
            ? 'Cost resolved to zero — verify source data.'
            : currencyMismatch
              ? `Currency mismatch: resolved ${result.currency}, expected ${buildCurrency}.`
              : null,
        }
      })
    )

    // Summary stats across rows with valid costs in the build currency
    const comparable = rows.filter(r => r.status === 'ok' && r.cost !== null).map(r => r.cost as number)
    const lowestCost  = comparable.length > 0 ? Math.min(...comparable) : null
    const highestCost = comparable.length > 0 ? Math.max(...comparable) : null

    const result: ComparisonResult = {
      skuId,
      siteId,
      buildCurrency,
      averagePurchaseLookbackDays,
      rows,
      lowestCost,
      highestCost,
      currencyMismatch: rows.some(r => r.status === 'currency_mismatch'),
      runAt: new Date().toISOString(),
    }

    return NextResponse.json({ data: result })
  } catch (err) {
    console.error('[POST /api/cost-comparison]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
