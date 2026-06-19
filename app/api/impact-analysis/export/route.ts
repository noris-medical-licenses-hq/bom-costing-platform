/**
 * GET /api/impact-analysis/export?type=price_list&fromId=<uuid>&toId=<uuid>
 *
 * BG-019 + BG-020: Downloads the full impact analysis as a multi-sheet XLSX.
 * Sheets: Cost Changes | BOM Impact | Inventory Impact | Mfg Impact
 * Delegates to the existing BG-020 export framework.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/backend/lib/supabase'
import { issueExcelResponse, type IssueRow } from '@/backend/lib/excelExport'
import type { CostChange, BomImpactRow, InventoryImpactRow, MfgImpactRow } from '@/backend/lib/impactAnalysis'

export async function GET(request: NextRequest) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Delegate to the main impact-analysis API by calling it internally
    const url    = new URL(request.url)
    const type   = url.searchParams.get('type')
    const fromId = url.searchParams.get('fromId')
    const toId   = url.searchParams.get('toId')

    if (!type || !fromId || !toId) {
      return NextResponse.json({ error: 'type, fromId and toId are required' }, { status: 400 })
    }

    // Re-use the analysis route handler
    const { GET: analyzeGET } = await import('@/app/api/impact-analysis/route')
    const analysisReq = new NextRequest(
      `${url.origin}/api/impact-analysis?type=${type}&fromId=${fromId}&toId=${toId}`,
      { headers: request.headers }
    )
    const analysisRes = await analyzeGET(analysisReq)
    if (!analysisRes.ok) return analysisRes

    const { data } = await analysisRes.json()
    const fromLabel = (data.meta.from_label as string).replace(/[^a-z0-9_\- ]/gi, '').slice(0, 20)
    const toLabel   = (data.meta.to_label   as string).replace(/[^a-z0-9_\- ]/gi, '').slice(0, 20)
    const now       = new Date().toISOString()

    const sheets = [
      { name: 'Cost Changes',      issues: mapCostChanges(data.cost_changes, data.meta.currency, now) },
      { name: 'BOM Impact',        issues: mapBomImpact(data.bom_impact, now) },
      { name: 'Inventory Impact',  issues: mapInventoryImpact(data.inventory_impact, now) },
      { name: 'Mfg Impact',        issues: mapMfgImpact(data.mfg_impact, now) },
    ]

    return issueExcelResponse(sheets, `impact-${fromLabel}-vs-${toLabel}`)
  } catch (err) {
    console.error('[GET /api/impact-analysis/export]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── IssueRow mappers ─────────────────────────────────────────────────────────

function mapCostChanges(changes: CostChange[], currency: string, now: string): IssueRow[] {
  return changes.map(c => ({
    severity:      c.severity,
    module:        'Impact Analysis',
    entity_type:   'SKU',
    entity_id:     c.sku_id,
    sku:           c.part_number,
    error_code:    `COST_CHANGE_${c.severity}`,
    error_message: `${c.part_number}: ${currency} ${c.old_cost.toFixed(4)} → ${c.new_cost.toFixed(4)} (${c.pct_change >= 0 ? '+' : ''}${c.pct_change.toFixed(2)}%)`,
    suggested_fix: c.severity === 'CRITICAL'
      ? 'Review and approve change before rebuilding costs'
      : c.severity === 'WARNING'
        ? 'Verify with procurement before proceeding'
        : 'Informational — no action required',
    detected_at: now,
  }))
}

function mapBomImpact(rows: BomImpactRow[], now: string): IssueRow[] {
  return rows.map(r => ({
    severity:      r.affected_bom_count > 10 ? 'CRITICAL' as const : r.affected_bom_count > 3 ? 'WARNING' as const : 'INFO' as const,
    module:        'Impact Analysis',
    entity_type:   'Component SKU',
    entity_id:     r.component_sku_id,
    sku:           r.component_part_number,
    error_message: `Component ${r.component_part_number} affects ${r.affected_bom_count} BOM(s) and ${r.affected_fg_count} finished good(s)`,
    suggested_fix: `Review all BOMs containing ${r.component_part_number} before approving cost change`,
    detected_at:   now,
  }))
}

function mapInventoryImpact(rows: InventoryImpactRow[], now: string): IssueRow[] {
  return rows.map(r => ({
    severity:      Math.abs(r.value_delta) > 10000 ? 'CRITICAL' as const : Math.abs(r.value_delta) > 1000 ? 'WARNING' as const : 'INFO' as const,
    module:        'Impact Analysis',
    entity_type:   'Inventory Line',
    entity_id:     r.sku_id,
    sku:           r.part_number,
    site:          r.site_name,
    error_message: `${r.part_number} @ ${r.warehouse_name}: qty ${r.quantity}, value ${r.currency} ${r.old_value.toFixed(2)} → ${r.new_value.toFixed(2)} (delta ${r.value_delta >= 0 ? '+' : ''}${r.value_delta.toFixed(2)})`,
    suggested_fix: r.value_delta < 0 ? 'Value decrease — review if revaluation is needed' : 'Value increase — update inventory valuations',
    detected_at:   now,
  }))
}

function mapMfgImpact(rows: MfgImpactRow[], now: string): IssueRow[] {
  return rows.map(r => ({
    severity:      r.affected_element_count > 3 ? 'CRITICAL' as const : 'WARNING' as const,
    module:        'Impact Analysis',
    entity_type:   'Mfg Structure',
    entity_id:     r.structure_id,
    sku:           r.finished_good_part_number,
    error_message: `Structure "${r.structure_name}" (${r.mode}): ${r.affected_element_count} process element(s) affected`,
    suggested_fix: 'Re-run MFG_COST_ROLLUP after applying cost changes',
    detected_at:   now,
  }))
}
