import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/backend/lib/supabase'
import { recordMappingUsage } from '@/backend/lib/importMapping'

const Schema = z.object({
  importType: z.enum([
    'sku_master', 'bom_lines', 'costs', 'inventory_snapshot',
    'supplier_prices', 'suppliers', 'sites', 'warehouses',
    'cost_rules', 'rule_exceptions', 'virtual_components',
    'price_list', 'purchase_history',
  ]),
  fileName:       z.string(),
  mapping:        z.record(z.string()),
  totalRows:      z.number().int().positive(),
  priceListMeta:  z.object({
    priceListName:  z.string().optional(),
    targetCountry:  z.string().optional(),
    currency:       z.string().optional(),
    effectiveDate:  z.string().optional(),
  }).optional(),
  purchaseHistoryMeta: z.object({
    defaultSiteId: z.string().uuid().optional(),
  }).optional(),
})

// Creates a bare import job record without any rows.
// The client then streams chunks to POST /api/imports/[id]/chunk.
export async function POST(request: NextRequest) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const orgIdResult = await client.rpc('auth_org_id').maybeSingle()
    const orgId = (orgIdResult.data as string | null) ?? ''
    if (!orgId) return NextResponse.json({ error: 'No organization found' }, { status: 403 })

    const roleResult = await (client as any).rpc('auth_user_role').maybeSingle()
    const callerRole = (roleResult.data as string | null) ?? ''
    if (!['editor', 'cost_analyst', 'procurement', 'approver', 'admin'].includes(callerRole)) {
      return NextResponse.json({ error: 'editor role or above required to start imports' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = Schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
    }

    const { importType, fileName, mapping, totalRows, priceListMeta, purchaseHistoryMeta } = parsed.data

    const svc = createServiceSupabaseClient()
    const svcDb = svc as any

    const { data: job, error } = await svcDb.from('import_jobs').insert({
      organization_id: orgId,
      import_type:     importType,
      file_name:       fileName,
      status:          'uploading',
      total_rows:      totalRows,
      processed_rows:  0,
      valid_rows:      0,
      warning_rows:    0,
      error_rows:      0,
      mapping:         mapping,
      created_by:      user.id,
      metadata:        priceListMeta
        ? { price_list: priceListMeta }
        : purchaseHistoryMeta
        ? { purchase_history: purchaseHistoryMeta }
        : null,
    }).select('id').single()

    if (error || !job) {
      return NextResponse.json({ error: error?.message ?? 'Failed to create import job' }, { status: 500 })
    }

    // Record mapping usage for future suggestion improvement (fire-and-forget)
    recordMappingUsage(orgId, importType, mapping, client).catch(() => {})

    return NextResponse.json({ jobId: job.id, totalRows }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/imports/start]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
