/**
 * BG-019: Cost Change Impact Analysis Engine
 *
 * Compares two cost snapshots (price list versions OR cost builds) and produces:
 *   - cost_changes: per-SKU delta with severity classification
 *   - bom_impact:   which BOMs / finished goods are affected
 *   - inventory_impact: projected value deltas against the latest snapshot
 *   - mfg_impact: manufacturing structures referencing changed SKUs
 *   - summary: executive totals
 *
 * Performance contract: all DB reads are batched (no N+1).
 * All heavy lifting is done in TypeScript after the batch fetches.
 */

export type ImpactSeverity = 'CRITICAL' | 'WARNING' | 'INFO'

// ─── Public result types ──────────────────────────────────────────────────────

export interface CostChange {
  sku_id:         string
  part_number:    string
  name:           string
  old_cost:       number
  new_cost:       number
  abs_change:     number
  pct_change:     number      // signed percentage, e.g. +12.5 or -3.2
  currency:       string
  severity:       ImpactSeverity
  import_job_row_id?: string  // BG-017 trace link (from the "to" version item)
}

export interface BomImpactRow {
  component_sku_id:        string
  component_part_number:   string
  component_name:          string
  affected_bom_count:      number
  affected_fg_count:       number
  top_affected_fgs:        Array<{ sku_id: string; part_number: string; name: string }>
}

export interface InventoryImpactRow {
  site_name:       string
  warehouse_name:  string
  sku_id:          string
  part_number:     string
  name:            string
  quantity:        number
  currency:        string
  old_unit_cost:   number
  new_unit_cost:   number
  old_value:       number
  new_value:       number
  value_delta:     number
}

export interface MfgImpactRow {
  structure_id:        string
  structure_name:      string
  finished_good_sku_id:      string
  finished_good_part_number: string
  finished_good_name:        string
  mode:                string
  affected_element_count: number
  affected_elements: Array<{ element_name: string; reference_sku_id: string; part_number: string }>
}

export interface ImpactSummary {
  changed_skus:               number
  critical_changes:           number
  warning_changes:            number
  info_changes:               number
  affected_bom_count:         number
  affected_fg_count:          number
  inventory_value_delta:      number
  affected_mfg_structures:    number
}

export interface ComparisonMeta {
  comparison_type: 'price_list' | 'cost_build'
  from_id:         string
  to_id:           string
  from_label:      string
  to_label:        string
  currency:        string
  generated_at:    string
}

export interface ImpactResult {
  meta:              ComparisonMeta
  summary:           ImpactSummary
  cost_changes:      CostChange[]
  bom_impact:        BomImpactRow[]
  inventory_impact:  InventoryImpactRow[]
  mfg_impact:        MfgImpactRow[]
}

// ─── Severity classification ──────────────────────────────────────────────────

export function classifySeverity(pctChange: number): ImpactSeverity {
  const abs = Math.abs(pctChange)
  if (abs > 15) return 'CRITICAL'
  if (abs >= 5)  return 'WARNING'
  return 'INFO'
}

// ─── Cost delta computation ───────────────────────────────────────────────────

export interface SkuCostPoint {
  sku_id:            string
  part_number:       string
  name:              string
  cost:              number
  currency:          string
  import_job_row_id?: string
}

export function computeCostChanges(
  fromItems: SkuCostPoint[],
  toItems:   SkuCostPoint[]
): CostChange[] {
  const fromMap = new Map<string, SkuCostPoint>()
  for (const item of fromItems) fromMap.set(item.sku_id, item)

  const changes: CostChange[] = []
  for (const to of toItems) {
    const from = fromMap.get(to.sku_id)
    if (!from) continue  // new SKU — not a change

    const old_cost  = from.cost
    const new_cost  = to.cost
    if (old_cost === new_cost) continue

    const abs_change = new_cost - old_cost
    const pct_change = old_cost === 0 ? 100 : (abs_change / old_cost) * 100

    changes.push({
      sku_id:           to.sku_id,
      part_number:      to.part_number,
      name:             to.name,
      old_cost,
      new_cost,
      abs_change,
      pct_change,
      currency:         to.currency,
      severity:         classifySeverity(pct_change),
      import_job_row_id: to.import_job_row_id,
    })
  }

  changes.sort((a, b) => Math.abs(b.pct_change) - Math.abs(a.pct_change))
  return changes
}

// ─── BOM impact ───────────────────────────────────────────────────────────────

export interface BomLineFlat {
  bom_version_id:   string
  sku_id:           string
  bom_sku_id:       string        // the finished-good SKU that owns this BOM
  fg_part_number:   string
  fg_name:          string
}

export function computeBomImpact(
  changedSkuIds: Set<string>,
  bomLines:      BomLineFlat[],
  skuMap:        Map<string, { part_number: string; name: string }>
): BomImpactRow[] {
  // Build component → set<bom_version_id> and component → set<fg_sku_id>
  const compToBomVersions = new Map<string, Set<string>>()
  const compToFgs         = new Map<string, Map<string, { part_number: string; name: string }>>()

  for (const line of bomLines) {
    if (!changedSkuIds.has(line.sku_id)) continue

    if (!compToBomVersions.has(line.sku_id)) {
      compToBomVersions.set(line.sku_id, new Set())
      compToFgs.set(line.sku_id, new Map())
    }
    compToBomVersions.get(line.sku_id)!.add(line.bom_version_id)
    compToFgs.get(line.sku_id)!.set(line.bom_sku_id, {
      part_number: line.fg_part_number,
      name:        line.fg_name,
    })
  }

  const rows: BomImpactRow[] = []
  for (const [skuId, bomVersionSet] of compToBomVersions.entries()) {
    const fgMap = compToFgs.get(skuId)!
    const sku   = skuMap.get(skuId)

    const top_affected_fgs = [...fgMap.entries()]
      .slice(0, 5)
      .map(([fgId, fg]) => ({ sku_id: fgId, part_number: fg.part_number, name: fg.name }))

    rows.push({
      component_sku_id:       skuId,
      component_part_number:  sku?.part_number ?? '',
      component_name:         sku?.name ?? '',
      affected_bom_count:     bomVersionSet.size,
      affected_fg_count:      fgMap.size,
      top_affected_fgs,
    })
  }

  rows.sort((a, b) => b.affected_bom_count - a.affected_bom_count)
  return rows
}

// ─── Inventory impact ─────────────────────────────────────────────────────────

export interface InventoryLineFlat {
  sku_id:         string
  part_number:    string
  sku_name:       string
  quantity:       number
  unit_cost:      number
  currency:       string
  site_name:      string
  warehouse_name: string
}

export function computeInventoryImpact(
  costDeltaMap: Map<string, { new_cost: number; old_cost: number }>,
  invLines:     InventoryLineFlat[]
): InventoryImpactRow[] {
  const rows: InventoryImpactRow[] = []
  for (const line of invLines) {
    const delta = costDeltaMap.get(line.sku_id)
    if (!delta) continue

    const old_unit_cost = delta.old_cost
    const new_unit_cost = delta.new_cost
    const old_value     = line.quantity * old_unit_cost
    const new_value     = line.quantity * new_unit_cost
    const value_delta   = new_value - old_value

    rows.push({
      site_name:      line.site_name,
      warehouse_name: line.warehouse_name,
      sku_id:         line.sku_id,
      part_number:    line.part_number,
      name:           line.sku_name,
      quantity:       line.quantity,
      currency:       line.currency,
      old_unit_cost,
      new_unit_cost,
      old_value,
      new_value,
      value_delta,
    })
  }

  rows.sort((a, b) => Math.abs(b.value_delta) - Math.abs(a.value_delta))
  return rows
}

// ─── Manufacturing impact ─────────────────────────────────────────────────────

export interface MfgStructureFlat {
  structure_id:         string
  structure_name:       string
  finished_good_sku_id: string
  fg_part_number:       string
  fg_name:              string
  mode:                 string
  element_name:         string
  element_id:           string
  reference_sku_id:     string
  ref_part_number:      string
}

export function computeMfgImpact(
  changedSkuIds: Set<string>,
  mfgElements:   MfgStructureFlat[]
): MfgImpactRow[] {
  const structureMap = new Map<string, MfgImpactRow>()

  for (const el of mfgElements) {
    if (!changedSkuIds.has(el.reference_sku_id)) continue

    if (!structureMap.has(el.structure_id)) {
      structureMap.set(el.structure_id, {
        structure_id:              el.structure_id,
        structure_name:            el.structure_name,
        finished_good_sku_id:      el.finished_good_sku_id,
        finished_good_part_number: el.fg_part_number,
        finished_good_name:        el.fg_name,
        mode:                      el.mode,
        affected_element_count:    0,
        affected_elements:         [],
      })
    }
    const row = structureMap.get(el.structure_id)!
    row.affected_element_count++
    row.affected_elements.push({
      element_name:      el.element_name,
      reference_sku_id:  el.reference_sku_id,
      part_number:       el.ref_part_number,
    })
  }

  const rows = [...structureMap.values()]
  rows.sort((a, b) => b.affected_element_count - a.affected_element_count)
  return rows
}

// ─── Summary ──────────────────────────────────────────────────────────────────

export function buildSummary(
  changes:   CostChange[],
  bom:       BomImpactRow[],
  inventory: InventoryImpactRow[],
  mfg:       MfgImpactRow[]
): ImpactSummary {
  const bomSet = new Set<string>()
  const fgSet  = new Set<string>()
  for (const b of bom) {
    bomSet.add(b.component_sku_id)  // just need the total BOM count
    for (const fg of b.top_affected_fgs) fgSet.add(fg.sku_id)
  }

  return {
    changed_skus:            changes.length,
    critical_changes:        changes.filter(c => c.severity === 'CRITICAL').length,
    warning_changes:         changes.filter(c => c.severity === 'WARNING').length,
    info_changes:            changes.filter(c => c.severity === 'INFO').length,
    affected_bom_count:      bom.reduce((s, b) => s + b.affected_bom_count, 0),
    affected_fg_count:       bom.reduce((s, b) => s + b.affected_fg_count, 0),
    inventory_value_delta:   inventory.reduce((s, i) => s + i.value_delta, 0),
    affected_mfg_structures: mfg.length,
  }
}
