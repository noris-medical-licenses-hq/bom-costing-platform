import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/backend/lib/supabase'

// Describes the current state of the 4-step inventory costing pipeline.
// Used by the Dashboard to show guided next steps.

export interface PipelineStepState {
  status: 'done' | 'active' | 'action_needed' | 'pending'
  label:  string
  detail: string | null   // e.g. "DE Price List v2 · Jun 2026"
  href:   string
  count:  number
}

export interface WorkflowRecommendation {
  stepNumber:  number
  title:       string
  description: string
  actionLabel: string
  actionHref:  string
  urgency:     'high' | 'medium' | 'low'
}

export interface WorkflowStatus {
  steps: {
    priceList:  PipelineStepState
    costBuild:  PipelineStepState
    snapshot:   PipelineStepState
    valuation:  PipelineStepState
  }
  recommendation: WorkflowRecommendation | null
}

export async function GET() {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const db = client as any

    // Run all 4 pipeline state queries in parallel
    const [plRes, cbRes, snapRes, valRes] = await Promise.all([
      // Latest active price list version
      db.from('price_list_versions')
        .select('id, version_number, currency, status, effective_date, item_count, country_price_lists(name, country_code)')
        .eq('status', 'active')
        .order('imported_at', { ascending: false })
        .limit(3),

      // Latest cost builds (all statuses)
      db.from('site_cost_builds')
        .select('id, name, status, default_strategy, line_count, built_at, approved_at, locked_at, sites(name, code, country)')
        .order('created_at', { ascending: false })
        .limit(5),

      // Latest inventory snapshots
      db.from('inventory_snapshots')
        .select('id, snapshot_name, snapshot_date, status, line_count, total_value, base_currency, cost_set_id')
        .order('created_at', { ascending: false })
        .limit(5),

      // Latest valuation reports
      db.from('valuation_reports')
        .select('id, name, status, total_value, base_currency, created_at')
        .order('created_at', { ascending: false })
        .limit(3),
    ])

    const priceLists: any[]     = plRes.data  ?? []
    const costBuilds: any[]     = cbRes.data  ?? []
    const snapshots: any[]      = snapRes.data ?? []
    const valuations: any[]     = valRes.data  ?? []

    // Derive step states
    const latestPl    = priceLists[0] ?? null
    const hasActivePl = priceLists.length > 0

    const approvedBuilds = costBuilds.filter(b => ['approved', 'locked'].includes(b.status))
    const latestBuild    = costBuilds[0] ?? null
    const hasApprovedBuild = approvedBuilds.length > 0
    const completeBuild  = costBuilds.find(b => b.status === 'complete')
    const draftBuild     = costBuilds.find(b => b.status === 'draft')

    const approvedSnaps   = snapshots.filter(s => s.status === 'approved')
    const latestSnap      = snapshots[0] ?? null
    const hasApprovedSnap = approvedSnaps.length > 0

    const approvedVals   = valuations.filter(v => ['approved', 'locked'].includes(v.status))
    const latestVal      = valuations[0] ?? null
    const hasApprovedVal = approvedVals.length > 0

    // ── Step 1: Price List ────────────────────────────────────────────────────
    const plDetail = latestPl
      ? `${(latestPl.country_price_lists as any)?.name ?? 'Price List'} v${latestPl.version_number} · ${latestPl.item_count ?? 0} SKUs`
      : null

    const step1: PipelineStepState = {
      status: hasActivePl ? 'done' : 'active',
      label:  'Import Price List',
      detail: plDetail,
      href:   '/imports',
      count:  priceLists.length,
    }

    // ── Step 2: Cost Build ────────────────────────────────────────────────────
    let buildStatus: PipelineStepState['status'] = 'pending'
    let buildDetail: string | null = null
    if (!hasActivePl) {
      buildStatus = 'pending'
    } else if (hasApprovedBuild) {
      buildStatus = 'done'
      const ab = approvedBuilds[0]
      buildDetail = `${ab.name} · ${ab.status} · ${ab.line_count ?? 0} SKUs`
    } else if (completeBuild) {
      buildStatus = 'action_needed'
      buildDetail = `${completeBuild.name} — needs approval`
    } else if (draftBuild) {
      buildStatus = 'action_needed'
      buildDetail = `${draftBuild.name} — needs to run`
    } else if (costBuilds.length === 0 && hasActivePl) {
      buildStatus = 'active'
    }

    const step2: PipelineStepState = {
      status: buildStatus,
      label:  'Build Cost Set',
      detail: buildDetail,
      href:   '/cost-builds',
      count:  costBuilds.length,
    }

    // ── Step 3: Inventory Snapshot ────────────────────────────────────────────
    let snapStatus: PipelineStepState['status'] = 'pending'
    let snapDetail: string | null = null
    if (!hasApprovedBuild) {
      snapStatus = 'pending'
    } else if (hasApprovedSnap) {
      snapStatus = 'done'
      snapDetail = `${approvedSnaps[0].snapshot_name} · ${approvedSnaps[0].line_count ?? 0} lines`
    } else if (latestSnap) {
      snapStatus = 'action_needed'
      snapDetail = `${latestSnap.snapshot_name} · ${latestSnap.status}`
    } else {
      snapStatus = 'active'
    }

    const step3: PipelineStepState = {
      status: snapStatus,
      label:  'Capture Inventory',
      detail: snapDetail,
      href:   '/inventory',
      count:  snapshots.length,
    }

    // ── Step 4: Valuation Report ──────────────────────────────────────────────
    let valStatus: PipelineStepState['status'] = 'pending'
    let valDetail: string | null = null
    if (!hasApprovedSnap) {
      valStatus = 'pending'
    } else if (hasApprovedVal) {
      valStatus = 'done'
      const av = approvedVals[0]
      const v  = av.total_value != null ? `${av.base_currency} ${Number(av.total_value).toLocaleString()}` : null
      valDetail = `${av.name}${v ? ` · ${v}` : ''}`
    } else if (latestVal) {
      valStatus = 'action_needed'
      valDetail = `${latestVal.name} · ${latestVal.status}`
    } else {
      valStatus = 'active'
    }

    const step4: PipelineStepState = {
      status: valStatus,
      label:  'Value Inventory',
      detail: valDetail,
      href:   '/inventory',
      count:  valuations.length,
    }

    // ── Recommendation ────────────────────────────────────────────────────────
    let recommendation: WorkflowRecommendation | null = null

    if (!hasActivePl) {
      recommendation = {
        stepNumber:  1,
        title:       'Start by importing a Country Price List',
        description: 'Upload your supplier price list (Excel or CSV). The platform will auto-detect the country, currency, and version, then make it available for costing.',
        actionLabel: 'Import Price List',
        actionHref:  '/imports',
        urgency:     'high',
      }
    } else if (!hasApprovedBuild) {
      if (completeBuild) {
        recommendation = {
          stepNumber:  2,
          title:       `Approve "${completeBuild.name}"`,
          description: `This Cost Build is complete (${completeBuild.line_count ?? 0} SKUs costed). Approve it to unlock Inventory Valuation.`,
          actionLabel: 'Go to Cost Builds',
          actionHref:  '/cost-builds',
          urgency:     'high',
        }
      } else if (draftBuild) {
        recommendation = {
          stepNumber:  2,
          title:       `Run "${draftBuild.name}"`,
          description: 'This Cost Build is ready to run. Running it will resolve prices for all active SKUs using the active country price list.',
          actionLabel: 'Go to Cost Builds',
          actionHref:  '/cost-builds',
          urgency:     'high',
        }
      } else {
        const country = (latestPl?.country_price_lists as any)?.country_code ?? ''
        const plName  = (latestPl?.country_price_lists as any)?.name ?? 'Price List'
        recommendation = {
          stepNumber:  2,
          title:       'Create a Cost Build',
          description: `"${plName}" v${latestPl?.version_number ?? 1} is active${country ? ` for ${country}` : ''}. Create a Cost Build to resolve SKU prices and prepare a frozen Cost Set for inventory valuation.`,
          actionLabel: 'Create Cost Build',
          actionHref:  '/cost-builds',
          urgency:     'high',
        }
      }
    } else if (!hasApprovedSnap) {
      if (latestSnap && latestSnap.status === 'draft') {
        recommendation = {
          stepNumber:  3,
          title:       `Import or review inventory for "${latestSnap.snapshot_name}"`,
          description: 'Your snapshot exists but has no quantities yet. Import inventory counts from your ERP, then approve the snapshot to unlock valuation.',
          actionLabel: 'Open Inventory',
          actionHref:  `/inventory/${latestSnap.id}`,
          urgency:     'medium',
        }
      } else {
        recommendation = {
          stepNumber:  3,
          title:       'Capture inventory quantities',
          description: 'Create an inventory snapshot and import on-hand quantities. Once approved, you can run Inventory Valuation.',
          actionLabel: 'Create Inventory Snapshot',
          actionHref:  '/inventory',
          urgency:     'medium',
        }
      }
    } else if (!hasApprovedVal) {
      recommendation = {
        stepNumber:  4,
        title:       'Run Inventory Valuation',
        description: `Snapshot "${approvedSnaps[0].snapshot_name}" is approved and ready. Run valuation to compute total inventory value using your approved Cost Build.`,
        actionLabel: 'Go to Inventory',
        actionHref:  `/inventory/${approvedSnaps[0].id}`,
        urgency:     'medium',
      }
    } else {
      // All done
      recommendation = {
        stepNumber:  4,
        title:       'Inventory costing is up to date',
        description: `Latest valuation: "${approvedVals[0].name}". Import a new price list when prices change to start a new costing cycle.`,
        actionLabel: 'View Valuation Report',
        actionHref:  `/inventory`,
        urgency:     'low',
      }
    }

    const status: WorkflowStatus = {
      steps: { priceList: step1, costBuild: step2, snapshot: step3, valuation: step4 },
      recommendation,
    }

    return NextResponse.json(status)
  } catch (err) {
    console.error('[GET /api/workflow-status]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
