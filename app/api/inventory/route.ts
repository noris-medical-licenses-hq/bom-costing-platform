import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/backend/lib/supabase'
import { listSnapshots, createSnapshot } from '@/backend/repositories/inventoryRepository'

const CreateSnapshotSchema = z.object({
  snapshot_name: z.string().min(1).max(255),
  snapshot_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  snapshot_type: z.enum(['full', 'site', 'warehouse', 'project']),
  cost_set_id: z.string().uuid(),
  base_currency: z.string().length(3),
  scope_site_id: z.string().uuid().nullable().optional(),
  scope_warehouse_id: z.string().uuid().nullable().optional(),
  scope_project_id: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const enriched = searchParams.get('enriched') === 'true'

    if (!enriched) {
      // Fast path: plain snapshot list (legacy consumers)
      const snapshots = await listSnapshots({
        status: (searchParams.get('status') as 'draft' | 'under_review' | 'approved' | 'superseded' | 'archived' | null) ?? undefined,
        snapshot_type: (searchParams.get('type') as 'full' | 'site' | 'warehouse' | 'project' | null) ?? undefined,
        from: searchParams.get('from') ?? undefined,
        to: searchParams.get('to') ?? undefined,
      }, client)
      return NextResponse.json({ data: snapshots })
    }

    // ── Enriched path ─────────────────────────────────────────────────────────
    // Returns snapshots with: site, best_build, latest_valuation
    const db = client as any

    const { data: snaps, error: snapsErr } = await db
      .from('inventory_snapshots')
      .select('id, snapshot_name, snapshot_date, snapshot_type, status, base_currency, line_count, total_value, missing_cost_count, scope_site_id, cost_set_id, created_at')
      .order('snapshot_date', { ascending: false })

    if (snapsErr) return NextResponse.json({ error: snapsErr.message }, { status: 500 })
    const snapshots: any[] = snaps ?? []
    if (snapshots.length === 0) return NextResponse.json({ data: [] })

    const siteIds      = [...new Set(snapshots.map(s => s.scope_site_id).filter(Boolean))] as string[]
    const snapshotIds  = snapshots.map(s => s.id) as string[]

    // Parallel: fetch sites, best builds per site, latest valuation per snapshot
    const [sitesRes, buildsRes, valRes] = await Promise.all([
      siteIds.length > 0
        ? db.from('sites').select('id, name, code, country').in('id', siteIds)
        : Promise.resolve({ data: [] }),

      siteIds.length > 0
        ? db.from('site_cost_builds')
            .select('id, name, status, site_id, cost_sets(id, name, base_currency)')
            .in('site_id', siteIds)
            .in('status', ['approved', 'locked', 'complete'])
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [] }),

      db.from('valuation_reports')
        .select('id, snapshot_id, status, total_value, base_currency, valuation_currency, created_at')
        .in('snapshot_id', snapshotIds)
        .order('created_at', { ascending: false }),
    ])

    // Build lookup maps
    const sitesById: Record<string, any> = {}
    for (const s of sitesRes.data ?? []) sitesById[s.id] = s

    // Best build per site: priority approved > locked > complete
    const PRIORITY: Record<string, number> = { approved: 3, locked: 2, complete: 1 }
    const bestBuildBySite: Record<string, any> = {}
    for (const b of buildsRes.data ?? []) {
      const current = bestBuildBySite[b.site_id]
      if (!current || (PRIORITY[b.status] ?? 0) > (PRIORITY[current.status] ?? 0)) {
        bestBuildBySite[b.site_id] = b
      }
    }

    // Latest valuation per snapshot
    const latestValBySnap: Record<string, any> = {}
    for (const v of valRes.data ?? []) {
      if (!latestValBySnap[v.snapshot_id]) latestValBySnap[v.snapshot_id] = v
    }

    const enrichedData = snapshots.map(snap => ({
      ...snap,
      site:              snap.scope_site_id ? (sitesById[snap.scope_site_id] ?? null) : null,
      best_build:        snap.scope_site_id ? (bestBuildBySite[snap.scope_site_id] ?? null) : null,
      latest_valuation:  latestValBySnap[snap.id] ?? null,
    }))

    return NextResponse.json({ data: enrichedData })
  } catch (err) {
    console.error('[GET /api/inventory]', err)
    return NextResponse.json({ error: 'Failed to fetch inventory snapshots' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = CreateSnapshotSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
    }
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const orgIdResult = await client.rpc('auth_org_id').maybeSingle()
    const orgId = (orgIdResult.data as string | null) ?? ''

    const snapshot = await createSnapshot({
      ...parsed.data,
      organization_id: orgId,
      scope_site_id: parsed.data.scope_site_id ?? null,
      scope_warehouse_id: parsed.data.scope_warehouse_id ?? null,
      scope_project_id: parsed.data.scope_project_id ?? null,
      notes: parsed.data.notes ?? null,
      status: 'draft',
      created_by: user.id,
      updated_by: user.id,
    }, client)

    return NextResponse.json({ data: snapshot }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create inventory snapshot' }, { status: 500 })
  }
}
