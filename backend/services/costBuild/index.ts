// Site Cost Build Engine
// Execution order:
//   Phase 1 — PURCHASED / SERVICE / MANUAL via non-BOM strategies
//   Phase 2 — MANUFACTURED / MAKE_OR_BUY via BOM_ROLLUP (recursive with memoization)
//
// Each resolved cost is written to:
//   • cost_items in the build's frozen cost_set  (used by Inventory Valuation)
//   • site_cost_build_lines                      (audit trail: site, type, strategy, source, fallback path)

import {
  STRATEGY_REGISTRY,
  DEFAULT_FALLBACK_CHAINS,
  resolveStrategyChain,
  priceListStrategy,
  lastPurchaseStrategy,
  averagePurchaseStrategy,
  type BuildStrategyContext,
  type StrategyResult,
} from './strategies'

const BATCH_SIZE = 100

export interface RunBuildResult {
  lineCount:       number
  errorCount:      number
  incompleteCount: number
  durationMs:      number
  errors:          Array<{ skuId: string; partNumber: string | null; reason: string }>
}

export async function runCostBuild(
  buildId:  string,
  orgId:    string,
  userId:   string,
  db:       any   // service Supabase client cast as any
): Promise<RunBuildResult> {
  const startMs = Date.now()

  // ── Load build ────────────────────────────────────────────────────────────
  const { data: build, error: buildErr } = await db
    .from('site_cost_builds')
    .select('*, sites(name, code)')
    .eq('id', buildId)
    .single()

  if (buildErr || !build) throw new Error(`Cost build not found: ${buildId}`)
  if (build.status === 'running') throw new Error('Build is already running')
  if (['approved', 'locked'].includes(build.status)) throw new Error(`Build is ${build.status} and cannot be re-run`)
  if (build.status === 'complete') throw new Error('Build is already complete — archive it first or approve it')

  await db.from('site_cost_builds')
    .update({ status: 'running' })
    .eq('id', buildId)

  const valuationDate = new Date().toISOString().slice(0, 10)

  try {
    // ── Resolve price list version ────────────────────────────────────────────
    // Use the pinned version if the user set one; otherwise auto-detect the latest
    // active version for the site's country.
    let priceListVersionId: string | null = build.price_list_version_id ?? null

    if (!priceListVersionId) {
      const { data: siteData } = await db
        .from('sites')
        .select('country')
        .eq('id', build.site_id)
        .maybeSingle()
      const siteCountry: string | null = siteData?.country ?? null

      if (siteCountry) {
        const { data: plRows } = await db
          .from('country_price_lists')
          .select('id')
          .eq('organization_id', orgId)
          .eq('country_code', siteCountry)
          .eq('is_active', true)
          .limit(1)

        const priceListId: string | null = plRows?.[0]?.id ?? null

        if (priceListId) {
          const { data: vRows } = await db
            .from('price_list_versions')
            .select('id')
            .eq('price_list_id', priceListId)
            .eq('status', 'active')
            .order('effective_date', { ascending: false })
            .limit(1)
          priceListVersionId = vRows?.[0]?.id ?? null
        }
      }
    }

    // Record which version was used so this build is reproducible
    if (priceListVersionId) {
      await db.from('site_cost_builds')
        .update({ price_list_version_id: priceListVersionId })
        .eq('id', buildId)
    }

    // ── Create frozen cost_set ────────────────────────────────────────────────
    const siteName: string = (build.sites as any)?.name ?? build.site_id
    const strategyLabel = build.default_strategy.replace(/_/g, ' ')
    const costSetName = `${siteName} — ${strategyLabel} (${valuationDate})`
    const buildCurrency: string = build.base_currency ?? 'EUR'
    const averagePurchaseLookbackDays: number = build.average_purchase_lookback_days ?? 365

    const { data: costSet, error: csErr } = await db
      .from('cost_sets')
      .insert({
        organization_id:      orgId,
        name:                 costSetName,
        cost_set_type:        build.default_strategy,
        effective_from:       valuationDate,
        base_currency:        buildCurrency,
        is_active:            true,
        is_frozen:            false,
        site_id:              build.site_id,
        source_build_id:      buildId,
        price_list_version_id: priceListVersionId,
        notes:                `Auto-created by cost build ${buildId}`,
      })
      .select('id')
      .single()

    if (csErr || !costSet) throw new Error(`Failed to create cost_set: ${csErr?.message}`)
    const costSetId: string = costSet.id

    // Link build to cost_set immediately so it's visible even if build fails later
    await db.from('site_cost_builds')
      .update({ cost_set_id: costSetId })
      .eq('id', buildId)

    const ctx: BuildStrategyContext = {
      orgId,
      siteId: build.site_id,
      costSetId,
      db,
      valuationDate,
      priceListVersionId,
      buildCurrency,
      averagePurchaseLookbackDays,
    }

    // ── Load all active SKUs ──────────────────────────────────────────────────
    const { data: skuRows } = await db
      .from('skus')
      .select('id, part_number, item_type, make_buy, item_cost_type')
      .eq('organization_id', orgId)
      .eq('is_active', true)

    const skus: Array<{ id: string; part_number: string | null; item_type: string; make_buy: string; item_cost_type: string }> = skuRows ?? []

    // ── Load sku_cost_overrides for this site ─────────────────────────────────
    const { data: overrideRows } = await db
      .from('sku_cost_overrides')
      .select('sku_id, preferred_strategy, fallback_strategies')
      .eq('organization_id', orgId)
      .eq('site_id', build.site_id)
      .eq('active', true)

    const overrideMap = new Map<string, { preferred_strategy: string; fallback_strategies: string[] }>()
    for (const o of overrideRows ?? []) overrideMap.set(o.sku_id, o)

    // Memoized cost resolver — handles recursive BOM rollup
    const costMemo = new Map<string, number>()
    const buildLines: Array<Record<string, unknown>> = []
    const costItems: Array<Record<string, unknown>> = []
    const errors: Array<{ skuId: string; partNumber: string | null; reason: string }> = []
    const incompleteSkus: Array<{ skuId: string; missingElements: Array<{ seq: number; name: string }> }> = []

    async function resolveSkuCost(
      skuId: string,
      itemCostType: string,
      chain: string[],
      visitStack: Set<string>
    ): Promise<{ cost: number; strategyUsed: string; result: StrategyResult | null; fallbackPath: string[] }> {
      if (costMemo.has(skuId)) {
        return { cost: costMemo.get(skuId)!, strategyUsed: 'cache', result: null, fallbackPath: [] }
      }

      if (visitStack.has(skuId)) {
        return { cost: 0, strategyUsed: 'cycle_detected', result: null, fallbackPath: [] }
      }

      const triedStrategies: string[] = []

      for (const strategy of chain) {
        triedStrategies.push(strategy)

        if (strategy === 'BOM_ROLLUP') {
          const bomCost = await computeBomRollup(skuId, visitStack, costSetId)
          if (bomCost !== null) {
            costMemo.set(skuId, bomCost.cost)
            return {
              cost:         bomCost.cost,
              strategyUsed: 'BOM_ROLLUP',
              result: {
                resolvedCost:     bomCost.cost,
                currency:         ctx.buildCurrency,
                sourceRecordType: 'bom_version',
                sourceRecordId:   bomCost.bomVersionId,
                sourceReference:  `BOM v${bomCost.version} — ${bomCost.lineCount} components`,
              },
              fallbackPath: triedStrategies.slice(0, -1),
            }
          }
          continue
        }

        if (strategy === 'MFG_COST_ROLLUP') {
          const mfgResult = await computeMfgRollup(skuId, visitStack, costSetId)
          if (mfgResult !== null) {
            costMemo.set(skuId, mfgResult.totalCost)
            if (mfgResult.isIncomplete) incompleteSkus.push({ skuId, missingElements: mfgResult.missingElements })
            return {
              cost:         mfgResult.totalCost,
              strategyUsed: 'MFG_COST_ROLLUP',
              result: {
                resolvedCost:     mfgResult.totalCost,
                currency:         ctx.buildCurrency,
                sourceRecordType: 'mfg_cost_structure',
                sourceRecordId:   mfgResult.structureId,
                sourceReference:  mfgResult.sourceReference,
                processBreakdown: mfgResult.breakdown,
              } as StrategyResult & { processBreakdown: unknown },
              fallbackPath: triedStrategies.slice(0, -1),
            }
          }
          continue
        }

        const fn = STRATEGY_REGISTRY[strategy]
        if (!fn) continue

        const result = await fn(skuId, ctx)
        if (result) {
          costMemo.set(skuId, result.resolvedCost)
          return {
            cost:         result.resolvedCost,
            strategyUsed: strategy,
            result,
            fallbackPath: triedStrategies.slice(0, -1),
          }
        }
      }

      return { cost: 0, strategyUsed: 'none', result: null, fallbackPath: triedStrategies }
    }

    async function computeBomRollup(
      assemblySkuId: string,
      visitStack: Set<string>,
      csId: string
    ): Promise<{ cost: number; bomVersionId: string; version: number; lineCount: number } | null> {
      const { data: boms } = await db
        .from('boms')
        .select('id')
        .eq('sku_id', assemblySkuId)
        .eq('organization_id', orgId)
        .limit(1)

      if (!boms?.length) return null

      const { data: versions } = await db
        .from('bom_versions')
        .select('id, version_number')
        .eq('bom_id', boms[0].id)
        .eq('status', 'approved')
        .order('version_number', { ascending: false })
        .limit(1)

      if (!versions?.length) return null
      const bomVersionId = versions[0].id
      const versionNum: number = versions[0].version_number

      const { data: lines } = await db
        .from('bom_lines')
        .select('id, sku_id, virtual_component_id, quantity, line_type, parent_line_id')
        .eq('bom_version_id', bomVersionId)

      if (!lines?.length) return null

      const newStack = new Set(visitStack)
      newStack.add(assemblySkuId)

      let totalCost = 0
      for (const line of lines as Array<{ sku_id: string | null; virtual_component_id: string | null; quantity: number; line_type: string; parent_line_id: string | null }>) {
        if (line.parent_line_id) continue  // only top-level lines in the flat tree

        if (line.sku_id) {
          const compSku  = skus.find(s => s.id === line.sku_id)
          const compType = compSku?.item_cost_type ?? 'PURCHASED'
          const compOverride = overrideMap.get(line.sku_id) ?? null
          const compChain = resolveStrategyChain(compType, build.default_strategy, compOverride)

          const resolved = await resolveSkuCost(line.sku_id, compType, compChain, newStack)
          totalCost += line.quantity * resolved.cost

          // Write component cost to cost_items if not already done
          if (!costMemo.has(line.sku_id) && resolved.cost > 0) {
            costMemo.set(line.sku_id, resolved.cost)
          }
        } else if (line.virtual_component_id) {
          const { data: vc } = await db
            .from('virtual_components')
            .select('cost_type, default_value')
            .eq('id', line.virtual_component_id)
            .maybeSingle()
          if (vc?.cost_type === 'fixed_per_unit') {
            totalCost += line.quantity * Number(vc.default_value)
          }
        }
      }

      return { cost: totalCost, bomVersionId, version: versionNum, lineCount: lines.length }
    }

    // ── computeMfgRollup ──────────────────────────────────────────────────────
    // Loads the active manufacturing_cost_structure for a SKU and resolves each
    // element's cost using the existing strategy functions. Returns null if no
    // active structure is found (engine falls through to BOM_ROLLUP).
    // Missing elements are flagged — they do NOT silently resolve to zero.
    interface MfgElementTrace {
      seq: number; name: string; type: string; category: string
      cost_source: string; unit_cost: number; qty: number; line_cost: number
      ref: string | null; missing: boolean
    }
    interface MfgRollupResult {
      totalCost: number; bomCost: number; processCost: number
      structureId: string; mode: string; isIncomplete: boolean
      missingElements: Array<{ seq: number; name: string }>
      sourceReference: string
      breakdown: Record<string, unknown>
    }

    async function computeMfgRollup(
      assemblySkuId: string,
      visitStack: Set<string>,
      csId: string
    ): Promise<MfgRollupResult | null> {
      // Load active structure for this SKU
      const { data: structure } = await db
        .from('manufacturing_cost_structures')
        .select('id, mode, version_number, effective_date')
        .eq('organization_id', orgId)
        .eq('sku_id', assemblySkuId)
        .eq('is_active', true)
        .maybeSingle()

      if (!structure) return null

      // Load elements ordered by sequence
      const { data: elements } = await db
        .from('mfg_cost_elements')
        .select('id, sequence, element_type, process_category, name, supplier_id, reference_sku_id, quantity, cost_source, fixed_cost, fixed_currency')
        .eq('structure_id', structure.id)
        .order('sequence', { ascending: true })

      const elems: Array<{
        id: string; sequence: number; element_type: string; process_category: string
        name: string; reference_sku_id: string | null; quantity: number
        cost_source: string; fixed_cost: number | null; fixed_currency: string | null
      }> = elements ?? []

      // Resolve BOM material cost for BOM_PLUS_PROCESS mode
      let bomCost = 0
      if (structure.mode === 'BOM_PLUS_PROCESS') {
        const bomResult = await computeBomRollup(assemblySkuId, visitStack, csId)
        bomCost = bomResult?.cost ?? 0
      }

      // Resolve each element cost
      const elementTraces: MfgElementTrace[] = []
      const missingElements: Array<{ seq: number; name: string }> = []
      let processCost = 0

      for (const el of elems) {
        let unitCost = 0
        let ref: string | null = null
        let missing = false

        if (el.cost_source === 'FIXED') {
          unitCost = Number(el.fixed_cost ?? 0)
          ref = `${el.fixed_cost} ${el.fixed_currency} (fixed)`
        } else {
          // Resolve using existing strategy functions — ctx already has orgId, siteId, currency, lookback
          const fn = el.cost_source === 'PRICE_LIST'        ? priceListStrategy
                   : el.cost_source === 'LAST_PURCHASE'     ? lastPurchaseStrategy
                   : el.cost_source === 'AVERAGE_PURCHASE'  ? averagePurchaseStrategy
                   : null

          if (fn && el.reference_sku_id) {
            const result = await fn(el.reference_sku_id, ctx)
            if (result) {
              unitCost = result.resolvedCost
              ref = result.sourceReference
            } else {
              missing = true
              missingElements.push({ seq: el.sequence, name: el.name })
            }
          } else {
            missing = true
            missingElements.push({ seq: el.sequence, name: el.name })
          }
        }

        const lineCost = unitCost * Number(el.quantity)
        processCost += lineCost

        elementTraces.push({
          seq:         el.sequence,
          name:        el.name,
          type:        el.element_type,
          category:    el.process_category,
          cost_source: el.cost_source,
          unit_cost:   unitCost,
          qty:         Number(el.quantity),
          line_cost:   lineCost,
          ref,
          missing,
        })
      }

      const totalCost = bomCost + processCost
      const isIncomplete = missingElements.length > 0

      const missingNames = missingElements.map(m => `#${m.seq} ${m.name}`).join(', ')
      const sourceRef = isIncomplete
        ? `MFG ${structure.mode} v${structure.version_number} — INCOMPLETE (missing: ${missingNames})`
        : `MFG ${structure.mode} v${structure.version_number} — BOM ${bomCost.toFixed(4)} + Process ${processCost.toFixed(4)} = ${totalCost.toFixed(4)} ${ctx.buildCurrency}`

      return {
        totalCost, bomCost, processCost,
        structureId:    structure.id,
        mode:           structure.mode,
        isIncomplete,
        missingElements,
        sourceReference: sourceRef,
        breakdown: {
          mode:          structure.mode,
          version:       structure.version_number,
          effective_date: structure.effective_date,
          bom_cost:      bomCost,
          process_cost:  processCost,
          total_cost:    totalCost,
          currency:      ctx.buildCurrency,
          is_incomplete: isIncomplete,
          missing_elements: missingElements,
          elements:      elementTraces,
        },
      }
    }

    // ── Phase 1: Non-BOM SKUs ─────────────────────────────────────────────────
    const phase1Types = ['PURCHASED', 'SERVICE', 'MANUAL']
    const phase1Skus  = skus.filter(s => phase1Types.includes(s.item_cost_type))

    for (const sku of phase1Skus) {
      const override = overrideMap.get(sku.id) ?? null
      const chain    = resolveStrategyChain(sku.item_cost_type, build.default_strategy, override)
      const resolved = await resolveSkuCost(sku.id, sku.item_cost_type, chain, new Set())

      if (resolved.strategyUsed === 'none' || !resolved.result) {
        errors.push({ skuId: sku.id, partNumber: sku.part_number, reason: 'No price found in any strategy' })
        buildLines.push(buildLine(buildId, orgId, sku.id, sku.item_cost_type, 'none', null, 0, ctx.buildCurrency, [], null))
        continue
      }

      costItems.push(costItem(orgId, costSetId, sku.id, resolved.result, valuationDate))
      buildLines.push(buildLine(
        buildId, orgId, sku.id, sku.item_cost_type,
        resolved.strategyUsed, resolved.result, resolved.cost,
        resolved.result.currency, resolved.fallbackPath, null
      ))
    }

    // ── Phase 2: BOM / MAKE_OR_BUY SKUs ──────────────────────────────────────
    const phase2Types = ['MANUFACTURED', 'MAKE_OR_BUY']
    const phase2Skus  = skus.filter(s => phase2Types.includes(s.item_cost_type))

    for (const sku of phase2Skus) {
      const override = overrideMap.get(sku.id) ?? null
      const chain    = resolveStrategyChain(sku.item_cost_type, build.default_strategy, override)
      const resolved = await resolveSkuCost(sku.id, sku.item_cost_type, chain, new Set())

      if (resolved.strategyUsed === 'none' || !resolved.result) {
        errors.push({ skuId: sku.id, partNumber: sku.part_number, reason: 'No BOM or price found' })
        buildLines.push(buildLine(buildId, orgId, sku.id, sku.item_cost_type, 'none', null, 0, ctx.buildCurrency, [], null))
        continue
      }

      costItems.push(costItem(orgId, costSetId, sku.id, resolved.result, valuationDate))
      buildLines.push(buildLine(
        buildId, orgId, sku.id, sku.item_cost_type,
        resolved.strategyUsed, resolved.result, resolved.cost,
        resolved.result.currency, resolved.fallbackPath,
        (resolved.result as any).processBreakdown ?? null
      ))
    }

    // ── Batch write cost_items ────────────────────────────────────────────────
    for (let i = 0; i < costItems.length; i += BATCH_SIZE) {
      const { error: ciErr } = await db.from('cost_items').insert(costItems.slice(i, i + BATCH_SIZE))
      if (ciErr) throw new Error(`Failed to write cost_items batch ${i}: ${ciErr.message}`)
    }

    // ── Batch write build lines ───────────────────────────────────────────────
    for (let i = 0; i < buildLines.length; i += BATCH_SIZE) {
      const { error: blErr } = await db.from('site_cost_build_lines').insert(buildLines.slice(i, i + BATCH_SIZE))
      if (blErr) throw new Error(`Failed to write build_lines batch ${i}: ${blErr.message}`)
    }

    // ── Freeze cost_set and complete build ────────────────────────────────────
    await db.from('cost_sets').update({ is_frozen: true }).eq('id', costSetId)

    const lineCount = buildLines.filter(l => l['cost_strategy_used'] !== 'none').length
    const buildStatus = incompleteSkus.length > 0 ? 'complete_with_warnings' : 'complete'
    await db.from('site_cost_builds').update({
      status:      buildStatus,
      line_count:  lineCount,
      error_count: errors.length,
      built_at:    new Date().toISOString(),
      built_by:    userId,
      parameters_snapshot: {
        valuationDate,
        skuCount:  skus.length,
        lineCount,
        errorCount:       errors.length,
        incompleteCount:  incompleteSkus.length,
        durationMs:       Date.now() - startMs,
        buildCurrency:    ctx.buildCurrency,
        averagePurchaseLookbackDays: ctx.averagePurchaseLookbackDays,
        incompleteMfgSkus: incompleteSkus.length > 0 ? incompleteSkus : undefined,
      },
    }).eq('id', buildId)

    return { lineCount, errorCount: errors.length, incompleteCount: incompleteSkus.length, durationMs: Date.now() - startMs, errors }
  } catch (err) {
    await db.from('site_cost_builds').update({ status: 'failed' }).eq('id', buildId)
    throw err
  }
}

// ─── Row builders ─────────────────────────────────────────────────────────────

function costItem(
  orgId: string,
  costSetId: string,
  skuId: string,
  result: StrategyResult,
  effectiveFrom: string
): Record<string, unknown> {
  return {
    organization_id: orgId,
    cost_set_id:     costSetId,
    scope_type:      'sku',
    scope_id:        skuId,
    sku_id:          skuId,
    value:           result.resolvedCost,
    currency:        result.currency,
    item_type:       'material_price',
    value_unit:      'per_unit',
    applies_to:      'all',
    effective_from:  effectiveFrom,
    is_active:       true,
    source:          result.sourceReference,
  }
}

function buildLine(
  buildId: string,
  orgId: string,
  skuId: string,
  itemCostType: string,
  strategyUsed: string,
  result: StrategyResult | null,
  resolvedCost: number,
  currency: string,
  fallbackPath: string[],
  processBreakdown: Record<string, unknown> | null
): Record<string, unknown> {
  return {
    site_cost_build_id:      buildId,
    organization_id:         orgId,
    sku_id:                  skuId,
    item_cost_type:          itemCostType,
    cost_strategy_used:      strategyUsed,
    source_record_type:      result?.sourceRecordType ?? null,
    source_record_id:        result?.sourceRecordId ?? null,
    source_reference:        result?.sourceReference ?? null,
    fallback_path:           fallbackPath.length ? fallbackPath.map(s => ({ strategy: s, reason: 'not_available' })) : [],
    resolved_cost:           resolvedCost,
    currency:                currency,
    effective_from:          new Date().toISOString().slice(0, 10),
    process_cost_breakdown:  processBreakdown ?? null,
  }
}
