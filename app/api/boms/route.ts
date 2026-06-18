import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/backend/lib/supabase'
import { findBomBySku, createBom, createBomVersion } from '@/backend/repositories/bomRepository'
import { DbError } from '@/backend/repositories/base/errors'

const CreateBomSchema = z.object({
  sku_id: z.string().uuid(),
  version_notes: z.string().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const client = await createServerSupabaseClient()
    const { searchParams } = new URL(request.url)
    const skuId = searchParams.get('sku_id')
    if (!skuId) {
      return NextResponse.json({ error: 'sku_id query param required' }, { status: 400 })
    }
    const bom = await findBomBySku(skuId, client)
    return NextResponse.json({ data: bom })
  } catch (err) {
    if (err instanceof DbError && err.code === 'NOT_FOUND') {
      return NextResponse.json({ data: null })
    }
    console.error('[GET /api/boms]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = CreateBomSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 })
    }

    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Get org_id from profile
    const { data: profile } = await client.from('profiles').select('organization_id').eq('user_id', user.id).single()
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

    const bom = await createBom({
      organization_id: profile.organization_id,
      sku_id: parsed.data.sku_id,
      created_by: user.id,
      updated_by: user.id,
    }, client)

    const version = await createBomVersion({
      organization_id: profile.organization_id,
      bom_id: bom.id,
      version_number: 1,
      status: 'draft',
      notes: parsed.data.version_notes ?? null,
      is_locked: false,
      created_by: user.id,
      updated_by: user.id,
    }, client)

    return NextResponse.json({ data: { bom, version } }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/boms]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
