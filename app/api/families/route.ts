import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/backend/lib/supabase'
import { listFamilies, createFamily, listSubfamilies, createSubfamily } from '@/backend/repositories/familyRepository'

const CreateFamilySchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  is_active: z.boolean().default(true),
})

const CreateSubfamilySchema = z.object({
  family_id: z.string().uuid(),
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  is_active: z.boolean().default(true),
})

export async function GET(request: NextRequest) {
  try {
    const client = await createServerSupabaseClient()
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') ?? 'family'
    const familyId = searchParams.get('family_id')

    if (type === 'subfamily') {
      const subs = await listSubfamilies(familyId ?? null, true, client)
      return NextResponse.json({ data: subs })
    }

    const families = await listFamilies(true, client)
    return NextResponse.json({ data: families })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch families' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const orgIdResult = await client.rpc('auth_org_id').maybeSingle()
    const orgId = (orgIdResult.data as string | null) ?? ''

    if (body.type === 'subfamily') {
      const parsed = CreateSubfamilySchema.safeParse(body)
      if (!parsed.success) {
        return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
      }
      const sub = await createSubfamily({ ...parsed.data, organization_id: orgId, description: parsed.data.description ?? null, created_by: user.id, updated_by: user.id }, client)
      return NextResponse.json({ data: sub }, { status: 201 })
    }

    const parsed = CreateFamilySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
    }
    const family = await createFamily({ ...parsed.data, organization_id: orgId, description: parsed.data.description ?? null, created_by: user.id, updated_by: user.id }, client)
    return NextResponse.json({ data: family }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create family' }, { status: 500 })
  }
}
