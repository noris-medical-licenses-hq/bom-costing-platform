import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/backend/lib/supabase'

type RouteParams = { params: { id: string } }

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const db = client as any
    const { data, error } = await db
      .from('sites')
      .select(`
        id, code, name, country, default_currency, address, city,
        is_active, status, notes, pending_delete_at, deleted_at,
        delete_reason, archived_at, created_at, updated_at
      `)
      .eq('id', params.id)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: error.code === 'PGRST116' ? 404 : 500 })
    return NextResponse.json({ data })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

const UpdateSiteSchema = z.object({
  name:             z.string().min(1).max(200).optional(),
  country:          z.string().length(2).toUpperCase().optional().nullable(),
  default_currency: z.string().length(3).toUpperCase().optional(),
  address:          z.string().max(500).optional().nullable(),
  city:             z.string().max(200).optional().nullable(),
  notes:            z.string().max(2000).optional().nullable(),
})

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const parsed = UpdateSiteSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })

    const db = client as any

    // Block updates to deleted sites
    const { data: site } = await db.from('sites').select('status').eq('id', params.id).single()
    if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 })
    if (site.status === 'deleted') return NextResponse.json({ error: 'Cannot update a deleted site' }, { status: 409 })

    const { data, error } = await db
      .from('sites')
      .update({ ...parsed.data, updated_by: user.id })
      .eq('id', params.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
