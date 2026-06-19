import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/backend/lib/supabase'

// POST /api/mfg-structures/[id]/activate
// Deactivates any existing active version for this SKU and activates the given version.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const roleResult = await (client as any).rpc('auth_has_role', { roles: ['cost_analyst', 'admin'] }).maybeSingle()
    if (!roleResult.data) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

    const svc = createServiceSupabaseClient() as any

    // Load the structure to get sku_id and org
    const { data: structure, error: loadErr } = await svc
      .from('manufacturing_cost_structures')
      .select('id, organization_id, sku_id, version_number, is_active')
      .eq('id', params.id)
      .single()

    if (loadErr || !structure) return NextResponse.json({ error: 'Structure not found' }, { status: 404 })
    if (structure.is_active) return NextResponse.json({ error: 'This version is already active' }, { status: 400 })

    // Deactivate the current active version for this SKU (if any)
    await svc
      .from('manufacturing_cost_structures')
      .update({ is_active: false, updated_by: user.id, updated_at: new Date().toISOString() })
      .eq('organization_id', structure.organization_id)
      .eq('sku_id', structure.sku_id)
      .eq('is_active', true)
      .neq('id', params.id)

    // Activate the requested version
    const { data, error } = await svc
      .from('manufacturing_cost_structures')
      .update({ is_active: true, updated_by: user.id, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await svc.from('audit_log').insert({
      organization_id: structure.organization_id,
      actor_id:        user.id,
      event_type:      'mfg_structure_activated',
      event_category:  'data',
      resource_type:   'manufacturing_cost_structures',
      resource_id:     params.id,
      metadata:        { sku_id: structure.sku_id, version: structure.version_number },
    })

    return NextResponse.json({ data })
  } catch (err) {
    console.error('[POST /api/mfg-structures/[id]/activate]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
