// Cost Calculation Engine — 10-stage pipeline
// BLUEPRINT §5 and IMPLEMENTATION_PLAN.md §C
//
// Stage 01: Load approved BOM version + all lines
// Stage 02: Validation pre-flight (V-BOM, V-SKU)
// Stage 03: Resolve manual_cost_adjustments (Priority 0)
// Stage 04: Resolve cost_set_items (6-level precedence hierarchy)
// Stage 05: Apply active cost_rules
// Stage 06: Process rule_exceptions
// Stage 07: Roll up (parent cost = Σ child qty × child unit cost)
// Stage 08: Apply overhead and labor from cost_set_items
// Stage 09: Write calculation_traces (immutable, ADR-104)
// Stage 10: Build and return result

import type { SupabaseServerClient } from '../../lib/supabase'
import type {
  CostCalculationInput,
  CostCalculationResult,
  BomTreeNode,
  ResolvedCostMap,
  ManualAdjustmentMap,
  CostWarning,
} from './types'
import { detectBomCycle } from './cycle'
import {
  findApprovedBomVersion,
  loadBomTree,
} from '../../repositories/bomRepository'
import {
  findCostSetById,
  listCostItems,
  findActiveManualAdjustment,
} from '../../repositories/costRepository'
import { runValidationEngine } from '../validationEngine'

export async function calculateCost(
  input: CostCalculationInput,
  client: SupabaseServerClient
): Promise<CostCalculationResult> {
  const startedAt = Date.now()
  const warnings: CostWarning[] = []

  // ── Stage 01: Load BOM ──────────────────────────────────────────────────────
  const bomVersion = await findApprovedBomVersion(input.bomId, client)
  if (!bomVersion) {
    throw new Error(`No approved BOM version found for bom_id=${input.bomId}`)
  }
  const bomLines = await loadBomTree(bomVersion.id, client)

  // Cycle guard (belt-and-suspenders — cycle should never exist at read time)
  const cycleNodes = detectBomCycle(bomLines)
  if (cycleNodes) {
    throw new Error(`BOM contains a cycle: ${cycleNodes.join(' → ')}`)
  }

  // ── Stage 02: Validation pre-flight ────────────────────────────────────────
  const validationResult = await runValidationEngine(
    { scope_type: 'bom_version', scope_id: bomVersion.id, run_type: 'pre_calculation' },
    client
  )
  if (validationResult.errorCount > 0) {
    warnings.push({
      code: 'CALCULATION_ABORTED_ON_VALIDATION_ERROR',
      skuId: null,
      bomLineId: null,
      message: `Calculation aborted: ${validationResult.errorCount} validation errors found. Fix them and retry.`,
    })
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
        message: `Manual cost adjustment (id=${adj.id}) overrides cost_set for SKU ${skuId}`,
      })
    }
  }))

  // ── Stage 04: Resolve cost_set_items (6-level hierarchy) ───────────────────
  // TODO: implement full cost item resolution using resolveCostItemForSku from costRepository
  // For each sku_id NOT in manualAdjMap, resolve via 6-level precedence
  // See: backend/repositories/costRepository.ts resolveCostItemForSku
  const resolvedCostMap: ResolvedCostMap = new Map()
  // [IMPLEMENTATION PENDING — Stage 04]

  // ── Stage 05: Apply cost rules ──────────────────────────────────────────────
  // TODO: load active cost_rules ordered by priority, evaluate conditions, apply actions
  // See: TEST_STRATEGY.md §5 Cost Rule Tests
  // [IMPLEMENTATION PENDING — Stage 05]

  // ── Stage 06: Process rule exceptions ──────────────────────────────────────
  // TODO: for each SKU, check active exceptions that suppress or override rule actions
  // [IMPLEMENTATION PENDING — Stage 06]

  // ── Stage 07: Roll up ───────────────────────────────────────────────────────
  // TODO: bottom-up traversal; parent = Σ(child.rolledCost × qty)
  // [IMPLEMENTATION PENDING — Stage 07]

  // ── Stage 08: Apply overhead and labor ─────────────────────────────────────
  // TODO: apply global overhead_pct and labor_rate from cost_set_items
  // [IMPLEMENTATION PENDING — Stage 08]

  // ── Stage 09: Write trace ───────────────────────────────────────────────────
  // TODO: write calculation_traces + 4 sub-tables atomically
  // All trace writes must be in one transaction (Supabase RPC or service-role batch insert)
  // [IMPLEMENTATION PENDING — Stage 09]
  const traceId = 'trace-pending' // replace with actual trace ID from Stage 09

  // ── Stage 10: Build result ──────────────────────────────────────────────────
  return {
    traceId,
    totalUnitCost: 0,     // replace with actual total from Stage 08
    currency: (await findCostSetById(input.costSetId, client)).base_currency,
    breakdown: [],          // replace with actual breakdown from Stage 07
    warnings,
    durationMs: Date.now() - startedAt,
  }
}
