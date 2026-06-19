/**
 * GET /api/readiness
 *
 * BG-E06: Operational Readiness Dashboard
 *
 * Returns per-site pipeline readiness:
 *  - Price List (global check: any active version)
 *  - Cost Build (per site: approved or locked)
 *  - Inventory Snapshot (per site: approved)
 *  - Valuation Report (per site: approved or locked)
 *
 * Readiness scores: READY = 1.0, PARTIAL = 0.5, BLOCKED = 0.0
 * Site score = average × 100. Org score = average of site scores.
 *
 * All DB reads batched in 2 Promise.all rounds — no N+1.
 */
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/backend/lib/supabase'

export type ItemStatus = 'READY' | 'PARTIAL' | 'BLOCKED'

export interface ReadinessItem {
  status:  ItemStatus
  label:   string
  detail:  string | null
  href:    string
}

export interface SiteReadiness {
  site_id:        string
  site_name:      string
  site_code:      string
  country:        string | null
  price_list:     ReadinessItem
  cost_build:     ReadinessItem
  snapshot:       ReadinessItem
  valuation:      ReadinessItem
  score:          number    // 0–100
  blocking_reason: string | null
}

export interface ReadinessResponse {
  sites:     SiteReadiness[]
  org_score: number          // 0–100
  generated_at: string
}

function statusWeight(s: ItemStatus): number {
  if (s === 'READY')   return 1.0
  if (s === 'PARTIAL') return 0.5
  return 0
}

export async function GET() {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const db = client as any

    // ── Batch 1: sites + global price list check ──────────────────────────────
    const [sitesRes, plRes] = await Promise.all([
      db.from('sites').select('id, name, code, country').eq('status', 'active').order('name'),
      db.from('price_list_versions').select('id, version_number, effective_date, country_price_lists(name, country_code)').eq('status', 'active').order('effective_date', { ascending: false }).limit(1),
    ])

    const sites: any[]        = sitesRes.data ?? []
    const activePLs: any[]    = plRes.data ?? []
    const hasActivePL         = activePLs.length > 0
    const latestPL            = activePLs[0] ?? null
    const siteIds: string[]   = sites.map((s: any) => s.id)

    if (siteIds.length === 0) {
      return NextResponse.json({
        data: { sites: [], org_score: 0, generated_at: new Date().toISOString() } as ReadinessResponse,
      })
    }

    // ── Batch 2: cost builds, snapshots, valuation reports for all sites ──────
    const [buildsRes, snapshotsRes] = await Promise.all([
      db.from('site_cost_builds')
        .select('id, name, status, site_id, line_count, error_count, built_at')
        .in('site_id', siteIds)
        .order('created_at', { ascending: false }),
      db.from('inventory_snapshots')
        .select('id, snapshot_name, snapshot_date, status, scope_site_id, line_count, missing_cost_count')
        .in('scope_site_id', siteIds)
        .order('created_at', { ascending: false }),
    ])

    const allBuilds: any[]    = buildsRes.data ?? []
    const allSnapshots: any[] = snapshotsRes.data ?? []
    const snapshotIds         = allSnapshots.map((s: any) => s.id)

    // Valuation reports require snapshot IDs (they link via snapshot_id)
    let allValuations: any[] = []
    if (snapshotIds.length > 0) {
      const valRes = await db
        .from('valuation_reports')
        .select('id, name, status, total_value, base_currency, snapshot_id')
        .in('snapshot_id', snapshotIds)
        .order('created_at', { ascending: false })
      allValuations = valRes.data ?? []
    }

    // Build lookup: site_id → array of cost_builds (already ordered newest first)
    const buildsBySite = new Map<string, any[]>()
    for (const b of allBuilds) {
      if (!buildsBySite.has(b.site_id)) buildsBySite.set(b.site_id, [])
      buildsBySite.get(b.site_id)!.push(b)
    }

    // site_id → array of snapshots
    const snapsBySite = new Map<string, any[]>()
    for (const s of allSnapshots) {
      if (!snapsBySite.has(s.scope_site_id)) snapsBySite.set(s.scope_site_id, [])
      snapsBySite.get(s.scope_site_id)!.push(s)
    }

    // snapshot_id → array of valuation reports
    const valsBySnap = new Map<string, any[]>()
    for (const v of allValuations) {
      if (!valsBySnap.has(v.snapshot_id)) valsBySnap.set(v.snapshot_id, [])
      valsBySnap.get(v.snapshot_id)!.push(v)
    }

    // ── Compute per-site readiness ─────────────────────────────────────────────
    const siteReadiness: SiteReadiness[] = sites.map((site: any) => {
      // ── Price List (global) ───────────────────────────────────────────────
      const plItem: ReadinessItem = hasActivePL
        ? {
            status: 'READY',
            label:  'Price List',
            detail: latestPL.country_price_lists
              ? `${latestPL.country_price_lists.name} v${latestPL.version_number} (${latestPL.effective_date})`
              : `v${latestPL.version_number} (${latestPL.effective_date})`,
            href: '/price-lists',
          }
        : {
            status:  'BLOCKED',
            label:   'Price List',
            detail:  'No active price list — import one to enable costing',
            href:    '/imports',
          }

      // ── Cost Build (per site) ─────────────────────────────────────────────
      const siteBuilds = buildsBySite.get(site.id) ?? []
      const approvedBuild = siteBuilds.find(b => ['approved', 'locked'].includes(b.status))
      const completeBuild = siteBuilds.find(b => ['complete', 'complete_with_warnings'].includes(b.status))
      const anyBuild      = siteBuilds[0] ?? null

      let cbItem: ReadinessItem
      if (approvedBuild) {
        cbItem = {
          status: 'READY',
          label:  'Cost Build',
          detail: `${approvedBuild.name} · ${approvedBuild.line_count ?? 0} SKUs · ${approvedBuild.status}`,
          href:   '/cost-builds',
        }
      } else if (completeBuild) {
        cbItem = {
          status: 'PARTIAL',
          label:  'Cost Build',
          detail: `${completeBuild.name} — needs approval (${completeBuild.error_count ?? 0} errors)`,
          href:   '/cost-builds',
        }
      } else if (anyBuild) {
        cbItem = {
          status: 'PARTIAL',
          label:  'Cost Build',
          detail: `${anyBuild.name} · status: ${anyBuild.status}`,
          href:   '/cost-builds',
        }
      } else {
        cbItem = {
          status: 'BLOCKED',
          label:  'Cost Build',
          detail: 'No cost build for this site — create one to enable valuation',
          href:   '/cost-builds',
        }
      }

      // ── Inventory Snapshot (per site) ─────────────────────────────────────
      const siteSnaps   = snapsBySite.get(site.id) ?? []
      const approvedSnap = siteSnaps.find(s => s.status === 'approved')
      const anySnap      = siteSnaps[0] ?? null

      let snapItem: ReadinessItem
      if (approvedSnap) {
        snapItem = {
          status: 'READY',
          label:  'Inventory Snapshot',
          detail: `${approvedSnap.snapshot_name} (${approvedSnap.snapshot_date}) · ${approvedSnap.line_count ?? 0} lines`,
          href:   `/inventory/${approvedSnap.id}`,
        }
      } else if (anySnap) {
        const missing = anySnap.missing_cost_count ?? 0
        snapItem = {
          status: 'PARTIAL',
          label:  'Inventory Snapshot',
          detail: `${anySnap.snapshot_name} · ${anySnap.status}${missing > 0 ? ` · ${missing} missing costs` : ''}`,
          href:   `/inventory/${anySnap.id}`,
        }
      } else {
        snapItem = {
          status: 'BLOCKED',
          label:  'Inventory Snapshot',
          detail: 'No inventory snapshot for this site — import inventory counts',
          href:   '/inventory',
        }
      }

      // ── Valuation Report (per site, via snapshots) ────────────────────────
      // Find best valuation across all site snapshots
      let bestVal: any = null
      for (const snap of siteSnaps) {
        const vals = valsBySnap.get(snap.id) ?? []
        const approvedVal = vals.find(v => ['approved', 'locked'].includes(v.status))
        const completeVal = vals.find(v => v.status === 'complete')
        const candidate   = approvedVal ?? completeVal ?? vals[0] ?? null
        if (!candidate) continue
        const weight = ['approved', 'locked'].includes(candidate.status) ? 2
                     : candidate.status === 'complete' ? 1 : 0
        const bestWeight = bestVal
          ? (['approved', 'locked'].includes(bestVal.status) ? 2 : bestVal.status === 'complete' ? 1 : 0)
          : -1
        if (weight > bestWeight) bestVal = candidate
      }

      let valItem: ReadinessItem
      if (bestVal && ['approved', 'locked'].includes(bestVal.status)) {
        const v = bestVal.total_value != null
          ? `${bestVal.base_currency} ${Number(bestVal.total_value).toLocaleString()}`
          : null
        valItem = {
          status: 'READY',
          label:  'Valuation Report',
          detail: `${bestVal.name}${v ? ` · ${v}` : ''} · ${bestVal.status}`,
          href:   `/valuation-reports/${bestVal.id}`,
        }
      } else if (bestVal) {
        valItem = {
          status: 'PARTIAL',
          label:  'Valuation Report',
          detail: `${bestVal.name} · ${bestVal.status} — needs approval`,
          href:   `/valuation-reports/${bestVal.id}`,
        }
      } else {
        valItem = {
          status: 'BLOCKED',
          label:  'Valuation Report',
          detail: 'No valuation report — run inventory valuation to generate one',
          href:   '/inventory',
        }
      }

      // ── Site score & blocking reason ──────────────────────────────────────
      const weights  = [plItem, cbItem, snapItem, valItem].map(i => statusWeight(i.status))
      const score    = Math.round((weights.reduce((s, w) => s + w, 0) / weights.length) * 100)
      const blockers = [plItem, cbItem, snapItem, valItem].filter(i => i.status === 'BLOCKED')
      const blocking_reason = blockers.length > 0 ? blockers[0].detail : null

      return {
        site_id:      site.id,
        site_name:    site.name,
        site_code:    site.code,
        country:      site.country ?? null,
        price_list:   plItem,
        cost_build:   cbItem,
        snapshot:     snapItem,
        valuation:    valItem,
        score,
        blocking_reason,
      }
    })

    const orgScore = siteReadiness.length > 0
      ? Math.round(siteReadiness.reduce((s, r) => s + r.score, 0) / siteReadiness.length)
      : 0

    return NextResponse.json({
      data: {
        sites:        siteReadiness,
        org_score:    orgScore,
        generated_at: new Date().toISOString(),
      } as ReadinessResponse,
    })
  } catch (err) {
    console.error('[GET /api/readiness]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
