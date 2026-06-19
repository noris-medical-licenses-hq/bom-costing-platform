/**
 * GET /api/inventory/[id]/export-issues
 *
 * Downloads an Excel file of inventory lines with missing or zero unit costs
 * for a specific snapshot, plus lines flagged has_missing_cost = true.
 * BG-020: Universal Failure Export Framework.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/backend/lib/supabase'
import { issueExcelResponse, type IssueRow } from '@/backend/lib/excelExport'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const db = client as any

    // Verify snapshot exists
    const { data: snap, error: snapErr } = await db
      .from('inventory_snapshots')
      .select('id, snapshot_name, snapshot_date, base_currency')
      .eq('id', params.id)
      .single()

    if (snapErr || !snap) return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 })

    // Lines with no unit_cost OR has_missing_cost = true
    const { data: lines, error: linesErr } = await db
      .from('inventory_lines')
      .select(`
        id, sku_id, quantity, unit_cost, has_missing_cost, cost_source,
        skus(part_number, name, item_type, item_cost_type),
        warehouses(code, name, sites(name))
      `)
      .eq('snapshot_id', params.id)
      .or('unit_cost.is.null,has_missing_cost.eq.true')
      .order('skus(part_number)', { ascending: true })
      .limit(10000)

    if (linesErr) return NextResponse.json({ error: linesErr.message }, { status: 500 })

    const now = new Date().toISOString()
    const issues: IssueRow[] = []

    for (const line of (lines ?? []) as any[]) {
      const sku      = line.skus?.part_number ?? ''
      const strategy = line.cost_source ?? 'unknown'
      const site     = line.warehouses?.sites?.name ?? ''
      const wh       = line.warehouses?.name ?? line.warehouses?.code ?? ''

      const isNullCost = line.unit_cost == null
      const isMissing  = line.has_missing_cost === true

      issues.push({
        severity:      'WARNING',
        module:        'Inventory',
        entity_type:   'Inventory Line',
        entity_id:     line.id,
        sku,
        site,
        error_code:    isNullCost ? 'LINE_NO_COST' : 'MISSING_COST_FLAG',
        error_message: isNullCost
          ? `"${sku}" in ${wh || 'unknown warehouse'}: no unit cost assigned (qty: ${line.quantity ?? 0})`
          : `"${sku}" in ${wh || 'unknown warehouse'}: flagged as missing cost (cost source: ${strategy}, qty: ${line.quantity ?? 0})`,
        suggested_fix: 'Run inventory valuation with an approved cost build that covers this SKU',
        detected_at:   now,
      })
    }

    const safeName = String(snap.snapshot_name).replace(/[^a-z0-9_-]/gi, '_').slice(0, 30)
    return issueExcelResponse([{ name: 'Inventory Issues', issues }], `inventory-issues-${safeName}`)
  } catch (err) {
    console.error('[GET /api/inventory/[id]/export-issues]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
