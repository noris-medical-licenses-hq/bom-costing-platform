import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/backend/lib/supabase'
import { runValuationReport } from '@/backend/services/valuationReport'

const WarehouseFilterSchema = z.object({
  warehouseId:      z.string().uuid(),
  included:         z.boolean(),
  exclusionReason:  z.string().optional(),
})

const ExchangeRateSchema = z.object({
  fromCurrency:  z.string().length(3),
  toCurrency:    z.string().length(3),
  rate:          z.number().positive(),
})

const CreateSchema = z.object({
  snapshotId:          z.string().uuid(),
  costSetId:           z.string().uuid(),
  valuationCurrency:   z.string().length(3),
  valuationScenario:   z.enum(['month_end', 'audit', 'management', 'budget', 'forecast']).default('management'),
  exchangeRateSource:  z.enum(['stored', 'manual', 'corporate']).default('manual'),
  fxSnapshotName:      z.string().optional(),
  warehouseFilter:     z.enum(['all', 'selected']).default('all'),
  warehouseFilters:    z.array(WarehouseFilterSchema).optional().default([]),
  exchangeRates:       z.array(ExchangeRateSchema).optional().default([]),
  notes:               z.string().optional(),
})

export async function GET() {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const db = client as any
    const { data, error } = await db
      .from('valuation_reports')
      .select(`
        id, snapshot_id, cost_set_id, valuation_currency, valuation_scenario,
        exchange_rate_source, fx_snapshot_name, warehouse_filter,
        status, total_value, line_count, missing_cost_count,
        notes, approved_at, created_at, completed_at,
        inventory_snapshots(snapshot_name, snapshot_date),
        cost_sets(name, base_currency)
      `)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: data ?? [] })
  } catch (err) {
    console.error('[GET /api/valuation-reports]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const orgIdResult = await client.rpc('auth_org_id').maybeSingle()
    const orgId = (orgIdResult.data as string | null) ?? ''
    if (!orgId) return NextResponse.json({ error: 'No organization found' }, { status: 403 })

    const body = await request.json()
    const parsed = CreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
    }

    const {
      snapshotId, costSetId, valuationCurrency, valuationScenario,
      exchangeRateSource, fxSnapshotName, warehouseFilter,
      warehouseFilters, exchangeRates, notes,
    } = parsed.data

    const svc = createServiceSupabaseClient()
    const svcDb = svc as any

    // ── Create the report record ──────────────────────────────────────────────

    const { data: report, error: reportErr } = await svcDb.from('valuation_reports').insert({
      organization_id:     orgId,
      snapshot_id:         snapshotId,
      cost_set_id:         costSetId,
      valuation_currency:  valuationCurrency,
      valuation_scenario:  valuationScenario,
      exchange_rate_source: exchangeRateSource,
      fx_snapshot_name:    fxSnapshotName ?? null,
      warehouse_filter:    warehouseFilter,
      status:              'draft',
      notes:               notes ?? null,
      created_by:          user.id,
      updated_by:          user.id,
    }).select('id').single()

    if (reportErr || !report) {
      return NextResponse.json({ error: reportErr?.message ?? 'Failed to create report' }, { status: 500 })
    }

    const reportId: string = report.id

    // ── Resolve FX rates (corporate source: copy from corporate_exchange_rates) ─

    let resolvedRates = [...exchangeRates]

    if (exchangeRateSource === 'corporate') {
      const { data: snapshot } = await svcDb.from('inventory_snapshots')
        .select('snapshot_date')
        .eq('id', snapshotId)
        .single()
      const effectiveDate = snapshot?.snapshot_date ?? new Date().toISOString().slice(0, 10)

      const { data: corpRates } = await svcDb.from('corporate_exchange_rates')
        .select('from_currency, to_currency, rate')
        .eq('organization_id', orgId)
        .lte('effective_date', effectiveDate)
        .order('effective_date', { ascending: false })

      // Take the most recent rate per currency pair (already sorted DESC)
      const seen = new Set<string>()
      for (const cr of corpRates ?? []) {
        const key = `${cr.from_currency}:${cr.to_currency}`
        if (!seen.has(key)) {
          seen.add(key)
          resolvedRates.push({ fromCurrency: cr.from_currency, toCurrency: cr.to_currency, rate: cr.rate })
        }
      }
    }

    // ── Store frozen exchange rates ───────────────────────────────────────────

    if (resolvedRates.length > 0) {
      const fxInserts = resolvedRates.map(r => ({
        report_id:     reportId,
        from_currency: r.fromCurrency,
        to_currency:   r.toCurrency,
        rate:          r.rate,
        source:        exchangeRateSource,
      }))
      await svcDb.from('valuation_report_exchange_rates').insert(fxInserts)
    }

    // ── Store warehouse filters ───────────────────────────────────────────────

    if (warehouseFilters.length > 0) {
      const wfInserts = warehouseFilters.map(wf => ({
        report_id:        reportId,
        warehouse_id:     wf.warehouseId,
        included:         wf.included,
        exclusion_reason: wf.included ? null : (wf.exclusionReason ?? ''),
      }))
      await svcDb.from('valuation_report_warehouse_filters').insert(wfInserts)
    }

    // ── Run the valuation engine ──────────────────────────────────────────────

    const result = await runValuationReport(reportId, svc)

    // ── Audit log ─────────────────────────────────────────────────────────────

    await svcDb.from('audit_log').insert({
      organization_id: orgId,
      event_type:      'data_insert',
      event_category:  'data',
      table_name:      'valuation_reports',
      record_id:       reportId,
      performed_by:    user.id,
      new_values: {
        snapshot_id:        snapshotId,
        cost_set_id:        costSetId,
        valuation_currency: valuationCurrency,
        valuation_scenario: valuationScenario,
        total_value:        result.totalValue,
        line_count:         result.lineCount,
        missing_cost_count: result.missingCostCount,
      },
    })

    return NextResponse.json({ data: { id: reportId, ...result } }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/valuation-reports]', err)
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 })
  }
}
