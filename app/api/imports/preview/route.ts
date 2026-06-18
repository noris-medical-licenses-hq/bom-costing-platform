import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/backend/lib/supabase'
import { suggestMappings } from '@/backend/lib/importMapping'

const Schema = z.object({
  importType: z.string(),
  columns:    z.array(z.string()),
})

export async function POST(request: NextRequest) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const parsed = Schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
    }

    const { importType, columns } = parsed.data

    const db = client as any
    const [suggestions, templatesResult] = await Promise.all([
      suggestMappings(columns, importType as never, client),
      db
        .from('import_templates')
        .select('id, name, import_type, import_template_mappings(source_column, target_field, confidence)')
        .eq('import_type', importType)
        .eq('active', true)
        .order('updated_at', { ascending: false }),
    ])

    return NextResponse.json({
      suggestions,
      templates: templatesResult.data ?? [],
    })
  } catch {
    return NextResponse.json({ error: 'Preview failed' }, { status: 500 })
  }
}
