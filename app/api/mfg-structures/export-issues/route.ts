/**
 * GET /api/mfg-structures/export-issues
 *
 * Downloads an Excel file of all manufacturing structure issues:
 * active structures with no elements, and elements with unresolved fixed costs.
 * BG-020: Universal Failure Export Framework.
 */
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/backend/lib/supabase'
import { issueExcelResponse, type IssueRow } from '@/backend/lib/excelExport'

export async function GET() {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const db  = client as any
    const now = new Date().toISOString()

    // Active structures — find those with no elements
    const { data: active, error: activeErr } = await db
      .from('manufacturing_cost_structures')
      .select('id, name, mode, skus(part_number, name)')
      .eq('is_active', true)
      .limit(1000)

    if (activeErr) return NextResponse.json({ error: activeErr.message }, { status: 500 })

    const activeArr = (active ?? []) as any[]
    const activeIds = activeArr.map((s: any) => s.id)

    let withElements = new Set<string>()
    if (activeIds.length > 0) {
      const { data: elements } = await db
        .from('mfg_cost_elements')
        .select('structure_id')
        .in('structure_id', activeIds)
      for (const e of (elements ?? []) as any[]) withElements.add(e.structure_id)
    }

    // Inactive structures
    const { data: inactive, error: inactiveErr } = await db
      .from('manufacturing_cost_structures')
      .select('id, name, skus(part_number)')
      .eq('is_active', false)
      .limit(500)

    if (inactiveErr) return NextResponse.json({ error: inactiveErr.message }, { status: 500 })

    // Elements with FIXED cost source and null/zero fixed_cost
    const { data: badFixed, error: fixedErr } = await db
      .from('mfg_cost_elements')
      .select('id, name, structure_id, cost_source, fixed_cost, manufacturing_cost_structures(name, skus(part_number))')
      .eq('cost_source', 'FIXED')
      .or('fixed_cost.is.null,fixed_cost.eq.0')
      .limit(2000)

    if (fixedErr) return NextResponse.json({ error: fixedErr.message }, { status: 500 })

    const issues: IssueRow[] = []

    // Active structures with no elements → CRITICAL
    for (const s of activeArr) {
      if (!withElements.has(s.id)) {
        issues.push({
          severity:      'CRITICAL',
          module:        'Manufacturing',
          entity_type:   'Cost Structure',
          entity_id:     s.id,
          sku:           s.skus?.part_number ?? '',
          error_code:    'STRUCTURE_NO_ELEMENTS',
          error_message: `Active structure "${s.name}" (${s.mode ?? ''}) for "${s.skus?.part_number ?? 'unknown'}" has no cost elements`,
          suggested_fix: 'Add at least one cost element (process step, material, or overhead) to this structure',
          detected_at:   now,
        })
      }
    }

    // Inactive structures → INFO
    for (const s of (inactive ?? []) as any[]) {
      issues.push({
        severity:      'INFO',
        module:        'Manufacturing',
        entity_type:   'Cost Structure',
        entity_id:     s.id,
        sku:           s.skus?.part_number ?? '',
        error_code:    'STRUCTURE_INACTIVE',
        error_message: `Structure "${s.name}" is inactive and will not be used in cost builds`,
        suggested_fix: 'Activate the structure if it should be included in Manufacturing Cost Rollup builds',
        detected_at:   now,
      })
    }

    // Elements with FIXED cost source and zero/null fixed_cost → WARNING
    for (const el of (badFixed ?? []) as any[]) {
      const struct = el.manufacturing_cost_structures
      issues.push({
        severity:      'WARNING',
        module:        'Manufacturing',
        entity_type:   'Cost Element',
        entity_id:     el.id,
        sku:           struct?.skus?.part_number ?? '',
        error_code:    'FIXED_COST_MISSING',
        error_message: `Element "${el.name}" in structure "${struct?.name ?? el.structure_id}" uses FIXED cost source but has no fixed_cost value`,
        suggested_fix: 'Set a positive fixed_cost value on this element or change the cost_source to PRICE_LIST or LAST_PURCHASE',
        detected_at:   now,
      })
    }

    const today = new Date().toISOString().slice(0, 10)
    return issueExcelResponse([{ name: 'Mfg Structure Issues', issues }], `mfg-structure-issues-${today}`)
  } catch (err) {
    console.error('[GET /api/mfg-structures/export-issues]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
