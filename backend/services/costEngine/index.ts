// Cost Calculation Engine — 10-stage pipeline (ADR-104, IMPLEMENTATION_PLAN.md §C)
import type { SupabaseServerClient } from '../../lib/supabase'
import type {
  CostCalculationInput,
  CostCalculationResult,
  CostBreakdownLine,
  CostSource,
  CostSourceType,
  BomTreeNode,
  ResolvedCostMap,
  ManualAdjustmentMap,
  CostWarning,
  AppliedRule,
  AppliedRuleException,
} from './types'
import { detectBomCycle } from './cycle'
import { applyAction, evaluateConditions, exceptionAppliesToSku } from './math'
import {
  findApprovedBomVersion,
  loadBomTree,
  type BomLine,
} from '../../repositories/bomRepository'
import {
  findCostSetById,
  resolveCostItemForSku,
  findBestSupplierPrice,
  findActiveManualAdjustment,
} from '../../repositories/costRepository'
import { listActiveRules, type RuleCondition, type RuleException } from '../../repositories/ruleRepository'
import { findSkusByIds, type Sku } from '../../repositories/skuRepository'
import {
  createTrace,
  completeTrace,
  createTraceLines,
  createCostSourceTraces,
  createRuleExecTraces,
} from '../../repositories/traceRepository'
import { runValidationEngine } from '../validationEngine'
import type { Tables } from '../../types/database.generated'

const ENGINE_VERSION = '1.0.0'

export async function calculateCost(
  input: CostCalculationInput,
  client: SupabaseServerClient
): Promise<CostCalculationResult> {
  const startedAt = Date.now()
  const valuationDate = input.valuationDate ?? new Date().toISOString().split('T')[0]
  const traceLevel = input.traceLevel ?? 'detailed'
  const warnings: CostWarning[] = []

  // ── Stage 01: Load BOM ──────────────────────────────────────────────────────
  // Load bom to get assembly sku_id, then approved version + lines
  const { data: bom } = await client.from('boms').select('sku_id').eq('id', input.bomId).single()
  const assemblySkuId: string = bom?.sku_id ?? input.bomId

  const bomVersion = await findApprovedBomVersion(input.bomId, client)
  if (!bomVersion) throw new Error(`No approved BOM version found for bom_id=${input.bomId}`)

  const bomLines = await loadBomTree(bomVersion.id, client)
  if (bomLines.length === 0) throw new Error(`BOM version ${bomVersion.id} has no lines`)

  const cycleNodes = detectBomCycle(bomLines)
  if (cycleNodes) throw new Error(`BOM contains a cycle: ${cycleNodes.join(' → ')}`)

  // ── Stage 02: Validation pre-flight ────────────────────────────────────────
  const validationResult = await runValidationEngine(
    { scope_type: 'bom_version', scope_id: bomVersion.id, run_type: 'pre_calculation' },
    client
  )
  if (validationResult.errorCount > 0) {
    throw new Error(`Validation errors block calculation: ${validationResult.errorCount} errors`)
  }

  // ── Stage 03: Resolve manual adjustments (Priority 0) ──────────────────────
  const skuIds = [...new Set(bomLines.map(l => l.sku_id).filter((id): id is string => id !== null))]
  const manualAdjMap: ManualAdjustmentMap = new Map()
  await Promise.all(skuIds.map(async (skuId) => {
    const adj = await findActiveManualAdjustment(skuId, input.costSetId, client)
    if (adj) {
      manualAdjMap.set(skuId, adj)
      warnings.push({
        code: 'MANUAL_ADJUSTMENT_OVERRIDES_COST_SET',
        skuId,
        bomLineId: null,
        message: `Manual adjustment (id=${adj.id}) overrides cost_set for SKU ${skuId}`,
      })
    }
  }))

  // ── Stage 04: Resolve cost_set_items (6-level hierarchy) ───────────────────
  const allSkus = await findSkusByIds(skuIds, client)
  const skuMap = new Map<string, Sku>(allSkus.map(s => [s.id, s]))

  const resolvedCostMap: ResolvedCostMap = new Map()

  await Promise.all(skuIds.map(async (skuId) => {
    if (manualAdjMap.has(skuId)) return
    const sku = skuMap.get(skuId)
    if (!sku) return

    const resolved = await resolveCostItemForSku(
      skuId,
      sku.subfamily_id,
      sku.family_id,
      sku.default_supplier_id,
      null,   // supplier country — requires loading supplier; deferred
      input.costSetId,
      'material_price',
      client
    )

    if (resolved) {
      const sourceType = precedenceLevelToSourceType(resolved.precedenceLevel as 1 | 2 | 3 | 4 | 5)
      resolvedCostMap.set(skuId, {
        source: {
          type: sourceType,
          precedenceLevel: resolved.precedenceLevel as 1 | 2 | 3 | 4 | 5,
          sourceId: resolved.item.id,
          value: resolved.item.value,
          wasOverridden: false,
          rejectedSources: [],
        },
        unitCost: resolved.item.value,
      })
    } else {
      // Level 6 fallback: supplier_price
      const price = await findBestSupplierPrice(skuId, sku.default_supplier_id, valuationDate, client)
      if (price) {
        resolvedCostMap.set(skuId, {
          source: {
            type: 'supplier_price',
            precedenceLevel: 6,
            sourceId: price.id,
            value: price.unit_price,
            wasOverridden: false,
            rejectedSources: [],
          },
          unitCost: price.unit_price,
        })
        warnings.push({
          code: 'ONLY_SUPPLIER_PRICE_AVAILABLE',
          skuId,
          bomLineId: null,
          message: `Only supplier price available for SKU ${skuId} — no cost_item in cost_set ${input.costSetId}`,
        })
      } else {
        warnings.push({
          code: 'NO_COST_FOUND',
          skuId,
          bomLineId: null,
          message: `No cost found for SKU ${skuId} in cost_set ${input.costSetId} or supplier_prices`,
        })
      }
    }
  }))

  // ── Stage 05+06: Apply cost rules and exceptions ────────────────────────────
  const activeRules = await listActiveRules(input.costSetId, valuationDate, client)
  const appliedRulesBySkuId = new Map<string, AppliedRule[]>()
  const appliedExceptionsBySkuId = new Map<string, AppliedRuleException[]>()
  const ruleExecTraceInputs: Parameters<typeof createRuleExecTraces>[0] = []

  for (const skuId of skuIds) {
    appliedRulesBySkuId.set(skuId, [])
    appliedExceptionsBySkuId.set(skuId, [])
  }

  for (const activeRule of activeRules) {
    if (activeRule.rule.pipeline_stage !== 'after_cost_resolution') continue

    for (const skuId of skuIds) {
      const sku = skuMap.get(skuId)
      if (!sku) continue

      const conditionsMet = evaluateConditions(activeRule.conditions, sku)
      const skuExceptions = activeRule.exceptions.filter(ex => exceptionAppliesToSku(ex, skuId, sku))
      const suppressingException = skuExceptions.find(ex => ex.exception_type === 'skip_rule')
      const suppressed = !!suppressingException

      const valueBefore = getCurrentCost(skuId, resolvedCostMap, manualAdjMap)
      let valueAfter = valueBefore

      if (conditionsMet && !suppressed) {
        for (const action of activeRule.actions) {
          valueAfter = applyAction(action, valueAfter)
        }
        if (valueAfter !== valueBefore) {
          const existing = resolvedCostMap.get(skuId)
          if (existing) {
            resolvedCostMap.set(skuId, { ...existing, unitCost: valueAfter })
          }
        }
      }

      const appliedRule: AppliedRule = {
        ruleId: activeRule.rule.id,
        ruleName: activeRule.rule.name,
        priority: activeRule.rule.priority,
        wasApplied: conditionsMet && !suppressed && valueAfter !== valueBefore,
        conditionsMet,
        valueBeforeRule: valueBefore,
        valueAfterRule: valueAfter,
        adjustmentAmount: valueAfter - valueBefore,
        rejectionReason: suppressed ? `Suppressed by exception ${suppressingException!.id}` : null,
      }
      appliedRulesBySkuId.get(skuId)!.push(appliedRule)

      if (suppressed && suppressingException) {
        appliedExceptionsBySkuId.get(skuId)!.push({
          exceptionId: suppressingException.id,
          ruleId: activeRule.rule.id,
          wasApplied: true,
          expiresAt: suppressingException.effective_to,
        })
      }

      // Collect for trace writing (placeholder trace_line_id filled in Stage 09)
      ruleExecTraceInputs.push({
        organization_id: bomVersion.organization_id,
        trace_id: '',           // filled in Stage 09
        trace_line_id: '',      // filled in Stage 09
        cost_rule_id: activeRule.rule.id,
        rule_name_snapshot: activeRule.rule.name,
        rule_priority: activeRule.rule.priority,
        condition_summary: buildConditionSummary(activeRule.conditions),
        condition_result: conditionsMet,
        was_applied: conditionsMet && !suppressed,
        suppressed_by_exception_id: suppressingException?.id ?? null,
        value_before: valueBefore,
        value_after: valueAfter,
        delta: valueAfter - valueBefore,
      })
    }
  }

  // ── Stage 07: Build BOM tree and roll up ────────────────────────────────────
  const vcIds = [...new Set(bomLines.map(l => l.virtual_component_id).filter((id): id is string => id !== null))]
  const vcMap = new Map<string, Tables<'virtual_components'>>()
  if (vcIds.length > 0) {
    const { data: vcs } = await client.from('virtual_components').select('*').in('id', vcIds)
    ;(vcs ?? []).forEach(vc => vcMap.set(vc.id, vc))
  }

  const nodeMap = new Map<string, BomTreeNode>()
  for (const line of bomLines) {
    nodeMap.set(line.id, {
      line,
      sku: skuMap.get(line.sku_id ?? '') ?? null,
      virtualComponent: vcMap.get(line.virtual_component_id ?? '') ?? null,
      children: [],
      resolvedUnitCost: null,
      rolledCost: null,
      costSource: null,
      appliedRules: appliedRulesBySkuId.get(line.sku_id ?? '') ?? [],
      appliedExceptions: appliedExceptionsBySkuId.get(line.sku_id ?? '') ?? [],
    })
  }

  const roots: BomTreeNode[] = []
  for (const node of nodeMap.values()) {
    if (node.line.parent_line_id) {
      nodeMap.get(node.line.parent_line_id)?.children.push(node)
    } else {
      roots.push(node)
    }
  }

  // DFS post-order: returns the unit cost of this node (material only, excluding parent's qty multiplier)
  function rollUpNode(node: BomTreeNode): number {
    let ownCost = 0
    if (node.line.sku_id) {
      const adj = manualAdjMap.get(node.line.sku_id)
      const resolved = resolvedCostMap.get(node.line.sku_id)
      if (adj) {
        ownCost = adj.adjusted_unit_cost
        node.costSource = { type: 'manual_adjustment', precedenceLevel: 0, sourceId: adj.id, value: adj.adjusted_unit_cost, wasOverridden: false, rejectedSources: [] }
      } else if (resolved) {
        ownCost = resolved.unitCost
        node.costSource = resolved.source
      }
    } else if (node.line.virtual_component_id && node.virtualComponent) {
      const vc = node.virtualComponent
      if (vc.cost_type === 'fixed_per_unit') {
        ownCost = vc.default_value
        node.costSource = { type: 'none', precedenceLevel: null, sourceId: vc.id, value: vc.default_value, wasOverridden: false, rejectedSources: [] }
      }
      // percentage-based VCs applied in Stage 08
    }

    const childrenContribution = node.children.reduce((sum, child) => sum + child.line.quantity * rollUpNode(child), 0)
    const unitCostWithChildren = ownCost + childrenContribution
    node.resolvedUnitCost = ownCost
    node.rolledCost = unitCostWithChildren
    return unitCostWithChildren
  }

  const materialTotal = roots.reduce((sum, root) => sum + root.line.quantity * rollUpNode(root), 0)

  // ── Stage 08: Apply overhead and virtual component percentages ──────────────
  const costSet = await findCostSetById(input.costSetId, client)
  const { data: globalCostItems } = await client
    .from('cost_items')
    .select('*')
    .eq('cost_set_id', input.costSetId)
    .eq('scope_type', 'global')

  let totalCost = materialTotal
  const overheadItem = (globalCostItems ?? []).find(ci => ci.item_type === 'overhead_pct')
  if (overheadItem) {
    totalCost = materialTotal * (1 + overheadItem.value / 100)
  }

  // Percentage-based virtual components at BOM total level
  for (const node of nodeMap.values()) {
    if (!node.virtualComponent) continue
    const vc = node.virtualComponent
    if (vc.cost_type === 'percentage_of_bom_total') {
      totalCost += materialTotal * (vc.default_value / 100) * node.line.quantity
    } else if (vc.cost_type === 'percentage_of_material') {
      totalCost += materialTotal * (vc.default_value / 100) * node.line.quantity
    }
  }

  // ── Stage 09: Write trace (append-only, ADR-104) ────────────────────────────
  const userId = (await client.auth.getUser()).data.user?.id
  const traceHeader = await createTrace({
    organization_id: bomVersion.organization_id,
    trace_type: 'sku_cost',
    sku_id: assemblySkuId,
    bom_version_id: bomVersion.id,
    cost_set_id: input.costSetId,
    valuation_date: valuationDate,
    quantity: 1,
    currency: costSet.base_currency,
    has_warnings: warnings.length > 0,
    warning_count: warnings.length,
    missing_cost_count: warnings.filter(w => w.code === 'NO_COST_FOUND').length,
    is_complete: false,
    engine_version: ENGINE_VERSION,
    triggered_by: userId!,
    triggered_at: new Date().toISOString(),
    trace_level: traceLevel,
  }, client)

  // Write trace lines (BFS to ensure parents before children)
  const traceLineIdByBomLineId = new Map<string, string>()
  const traceLineInputs: Parameters<typeof createTraceLines>[0] = []
  const bfsQueue = [...roots]
  while (bfsQueue.length > 0) {
    const node = bfsQueue.shift()!
    const parentTraceLineId = node.line.parent_line_id
      ? traceLineIdByBomLineId.get(node.line.parent_line_id) ?? null
      : null
    traceLineInputs.push({
      organization_id: bomVersion.organization_id,
      trace_id: traceHeader.id,
      parent_line_id: parentTraceLineId,
      bom_line_id: node.line.id,
      depth: node.line.depth,
      position: node.line.position,
      line_type: node.line.sku_id ? 'sku' : 'virtual_component',
      sku_id: node.line.sku_id ?? null,
      virtual_component_id: node.line.virtual_component_id ?? null,
      quantity: node.line.quantity,
      resolved_unit_cost: node.resolvedUnitCost,
      adjusted_unit_cost: node.rolledCost,
      line_total: node.line.quantity * (node.rolledCost ?? 0),
      cost_source_priority: node.costSource?.precedenceLevel ?? null,
      cost_source_type: node.costSource?.type ?? null,
      cost_source_id: node.costSource?.sourceId ?? null,
      cost_source_table: costSourceTypeToTable(node.costSource?.type ?? null),
      is_rolled_up: (node.children.length > 0),
      has_missing_cost: node.line.sku_id ? !resolvedCostMap.has(node.line.sku_id) && !manualAdjMap.has(node.line.sku_id) : false,
      is_reference_only: false,
      warnings: null,
    })
    bfsQueue.push(...node.children)
  }

  // Write in batches (trace_lines must be written in BFS order due to parent_line_id FK)
  const writtenLines = await createTraceLines(traceLineInputs, client)
  writtenLines.forEach(tl => { if (tl.bom_line_id) traceLineIdByBomLineId.set(tl.bom_line_id, tl.id) })

  await completeTrace(
    traceHeader.id,
    totalCost,
    Date.now() - startedAt,
    warnings.length > 0,
    warnings.length,
    warnings.filter(w => w.code === 'NO_COST_FOUND').length,
    client
  )

  // ── Stage 10: Build result ──────────────────────────────────────────────────
  const breakdown: CostBreakdownLine[] = []
  for (const node of nodeMap.values()) {
    breakdown.push({
      bomLineId: node.line.id,
      skuId: node.line.sku_id ?? null,
      virtualComponentId: node.line.virtual_component_id ?? null,
      partNumber: node.sku?.part_number ?? null,
      name: node.sku?.name ?? node.virtualComponent?.name ?? 'Unknown',
      quantity: node.line.quantity,
      unitCost: node.resolvedUnitCost ?? 0,
      totalCost: node.line.quantity * (node.resolvedUnitCost ?? 0),
      rolledUpCost: node.rolledCost ?? 0,
      depth: node.line.depth,
      costSource: node.costSource ?? { type: 'none', precedenceLevel: null, sourceId: null, value: null, wasOverridden: false, rejectedSources: [] },
      appliedRules: node.appliedRules,
      appliedExceptions: node.appliedExceptions,
    })
  }

  return {
    traceId: traceHeader.id,
    totalUnitCost: totalCost,
    currency: costSet.base_currency,
    breakdown,
    warnings,
    durationMs: Date.now() - startedAt,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function precedenceLevelToSourceType(level: 1 | 2 | 3 | 4 | 5): CostSourceType {
  const map: Record<number, CostSourceType> = {
    1: 'cost_set_item_sku',
    2: 'cost_set_item_subfamily',
    3: 'cost_set_item_family',
    4: 'cost_set_item_supplier',
    5: 'cost_set_item_global',
  }
  return map[level] ?? 'none'
}

function costSourceTypeToTable(type: CostSourceType | null): string | null {
  if (!type) return null
  if (type.startsWith('cost_set_item')) return 'cost_items'
  if (type === 'supplier_price') return 'supplier_prices'
  if (type === 'manual_adjustment') return 'manual_cost_adjustments'
  return null
}

function getCurrentCost(skuId: string, resolvedCostMap: ResolvedCostMap, manualAdjMap: ManualAdjustmentMap): number {
  const adj = manualAdjMap.get(skuId)
  if (adj) return adj.adjusted_unit_cost
  return resolvedCostMap.get(skuId)?.unitCost ?? 0
}


function buildConditionSummary(conditions: RuleCondition[]): string {
  if (conditions.length === 0) return '(always)'
  return conditions
    .map(c => `${c.condition_field} ${c.condition_operator} ${c.condition_value}`)
    .join(' AND ')
}
