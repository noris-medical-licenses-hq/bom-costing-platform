import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/backend/lib/supabase'

export interface FieldDef {
  field_key: string
  display_name: string
  description: string | null
  data_type: string
  field_category: string
  required_by_default: boolean
  is_system: boolean
  is_deprecated: boolean
  replacement_field_key: string | null
  sort_order: number
  synonyms: string[]
}

// GET /api/import-fields?importType=sku_master
// Returns system catalog + org custom fields + global/org synonyms, joined.
export async function GET(request: NextRequest) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const orgIdResult = await client.rpc('auth_org_id').maybeSingle()
    const orgId = (orgIdResult.data as string | null) ?? ''

    const importType = request.nextUrl.searchParams.get('importType')
    if (!importType) return NextResponse.json({ error: 'importType is required' }, { status: 400 })

    const db = client as any

    // Load system fields + org custom fields in parallel
    const [sysResult, customResult, synResult, usageResult] = await Promise.all([
      db.from('import_field_definitions')
        .select('field_key,display_name,description,data_type,field_category,required_by_default,is_system,is_deprecated,replacement_field_key,sort_order')
        .eq('import_type', importType)
        .eq('active', true)
        .order('sort_order'),

      db.from('organization_custom_fields')
        .select('field_key,display_name,description,data_type,field_category,required_by_default,sort_order')
        .eq('organization_id', orgId)
        .eq('import_type', importType)
        .eq('active', true)
        .order('sort_order'),

      db.from('import_field_synonyms')
        .select('field_key,synonym,is_global')
        .eq('import_type', importType)
        .or(`is_global.eq.true,organization_id.eq.${orgId}`),

      // Top org-specific mappings for confidence boosting (used by suggestion engine)
      db.from('import_field_usage_stats')
        .select('source_column,target_field,mapping_count')
        .eq('organization_id', orgId)
        .eq('import_type', importType)
        .order('mapping_count', { ascending: false })
        .limit(500),
    ])

    const synonymsByKey = new Map<string, string[]>()
    for (const row of (synResult.data ?? []) as Array<{ field_key: string; synonym: string }>) {
      const arr = synonymsByKey.get(row.field_key) ?? []
      arr.push(row.synonym)
      synonymsByKey.set(row.field_key, arr)
    }

    const systemFields: FieldDef[] = (sysResult.data ?? []).map((r: any) => ({
      ...r,
      is_system: true,
      synonyms: synonymsByKey.get(r.field_key) ?? [],
    }))

    const customFields: FieldDef[] = (customResult.data ?? []).map((r: any) => ({
      ...r,
      is_system: false,
      is_deprecated: false,
      replacement_field_key: null,
      synonyms: synonymsByKey.get(r.field_key) ?? [],
    }))

    return NextResponse.json({
      fields:      [...systemFields, ...customFields],
      usageStats:  usageResult.data ?? [],
      importType,
    })
  } catch (err) {
    console.error('[GET /api/import-fields]', err)
    return NextResponse.json({ error: 'Failed to load field catalog' }, { status: 500 })
  }
}

const CustomFieldSchema = z.object({
  importType:         z.string().min(1),
  fieldKey:           z.string().min(1).max(80).regex(/^[a-z][a-z0-9_]*$/, 'field_key must be snake_case'),
  displayName:        z.string().min(1).max(120),
  description:        z.string().max(500).optional(),
  dataType:           z.enum(['text','integer','decimal','date','boolean','percent','currency']).default('text'),
  fieldCategory:      z.string().max(60).default('custom'),
  requiredByDefault:  z.boolean().default(false),
})

// POST /api/import-fields — create org-specific custom field
export async function POST(request: NextRequest) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const orgIdResult = await client.rpc('auth_org_id').maybeSingle()
    const orgId = (orgIdResult.data as string | null) ?? ''
    if (!orgId) return NextResponse.json({ error: 'No organization found' }, { status: 403 })

    const body = await request.json()
    const parsed = CustomFieldSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
    }

    const { importType, fieldKey, displayName, description, dataType, fieldCategory, requiredByDefault } = parsed.data

    const svc = createServiceSupabaseClient()
    const svcDb = svc as any

    const { data: field, error } = await svcDb.from('organization_custom_fields').insert({
      organization_id:     orgId,
      import_type:         importType,
      field_key:           fieldKey,
      display_name:        displayName,
      description:         description ?? null,
      data_type:           dataType,
      field_category:      fieldCategory,
      required_by_default: requiredByDefault,
    }).select('id,field_key,display_name').single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: `Field key "${fieldKey}" already exists for this import type` }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(field, { status: 201 })
  } catch (err) {
    console.error('[POST /api/import-fields]', err)
    return NextResponse.json({ error: 'Failed to create custom field' }, { status: 500 })
  }
}
