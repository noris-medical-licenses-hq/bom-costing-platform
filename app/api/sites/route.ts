import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/backend/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const includeArchived = searchParams.get('includeArchived') === 'true'

    const db = client as any
    let q = db.from('sites').select('id, code, name, country, default_currency, status, is_active, notes, created_at, pending_delete_at, archived_at').order('name')
    if (!includeArchived) q = q.in('status', ['active'])

    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: data ?? [] })
  } catch (err) {
    console.error('[GET /api/sites]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

const CreateSiteSchema = z.object({
  code:             z.string().min(1).max(20).regex(/^[A-Z0-9_-]+$/i, 'Code must be alphanumeric'),
  name:             z.string().min(1).max(200),
  country:          z.string().length(2, 'Must be a 2-letter ISO country code').toUpperCase().optional().nullable(),
  default_currency: z.string().length(3, 'Must be a 3-letter currency code').toUpperCase().default('USD'),
  notes:            z.string().max(2000).optional().nullable(),
})

export async function POST(request: NextRequest) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const orgIdResult = await client.rpc('auth_org_id').maybeSingle()
    const orgId = (orgIdResult.data as string | null) ?? ''
    if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

    const body = await request.json()
    const parsed = CreateSiteSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })

    const db = client as any
    const { data, error } = await db.from('sites').insert({
      organization_id:  orgId,
      code:             parsed.data.code.toUpperCase(),
      name:             parsed.data.name,
      country:          parsed.data.country ?? null,
      default_currency: parsed.data.default_currency,
      notes:            parsed.data.notes ?? null,
      is_active:        true,
      status:           'active',
      created_by:       user.id,
      updated_by:       user.id,
    }).select().single()

    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'A site with this code already exists' }, { status: 409 })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/sites]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
