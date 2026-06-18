import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/backend/lib/supabase'

const CreateSchema = z.object({
  name:        z.string().min(1).max(100),
  import_type: z.string(),
  mappings:    z.array(z.object({
    source_column: z.string(),
    target_field:  z.string(),
    confidence:    z.number().optional().default(1.0),
  })),
})

export async function GET(request: NextRequest) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const importType = searchParams.get('type')

    const db = client as any
    let query = db
      .from('import_templates')
      .select('id, name, import_type, active, created_at, import_template_mappings(source_column, target_field, confidence)')
      .eq('active', true)
      .order('name')

    if (importType) query = query.eq('import_type', importType)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ data })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const orgIdResult = await client.rpc('auth_org_id').maybeSingle()
    const orgId = (orgIdResult.data as string | null) ?? ''

    const body = await request.json()
    const parsed = CreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
    }

    const { name, import_type, mappings } = parsed.data

    const db = client as any
    const { data: tmpl, error: tmplErr } = await db.from('import_templates').insert({
      organization_id: orgId,
      name,
      import_type,
      created_by: user.id,
    }).select('id').single()

    if (tmplErr || !tmpl) {
      return NextResponse.json({ error: tmplErr?.message ?? 'Failed to create template' }, { status: 500 })
    }

    if (mappings.length > 0) {
      await db.from('import_template_mappings').insert(
        mappings.map((m: { source_column: string; target_field: string; confidence: number }) => ({ ...m, template_id: tmpl.id }))
      )
    }

    return NextResponse.json({ data: tmpl }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 })
  }
}
