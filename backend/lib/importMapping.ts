import type { SupabaseServerClient } from './supabase'
import type { ImportType } from './importTypes'

export interface ColumnSuggestion {
  sourceColumn:   string
  suggestedField: string | null
  confidence:     number
  method:         'synonym_exact' | 'display_exact' | 'key_exact' | 'synonym_fuzzy' | 'usage_history' | 'none'
}

// Normalize for matching: lowercase, remove punctuation/spaces/diacritics.
// Handles common ERP export formatting and Hebrew characters.
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/מק"ט/g, 'מקט')
    .replace(/פק"ע/g, 'פקע')
    .replace(/[^a-z0-9א-ת]/g, '')
}

interface CatalogField {
  field_key:        string
  display_name:     string
  synonyms:         string[]
}

interface UsageStat {
  source_column: string
  target_field:  string
  mapping_count: number
}

export async function suggestMappings(
  sourceColumns: string[],
  importType: ImportType,
  client: SupabaseServerClient
): Promise<ColumnSuggestion[]> {
  const db = client as any
  const orgIdResult = await (client as any).rpc('auth_org_id').maybeSingle()
  const orgId = (orgIdResult.data as string | null) ?? ''

  // Load catalog fields (system + org custom) with synonyms
  const [sysDefs, customDefs, synRows, usageRows] = await Promise.all([
    db.from('import_field_definitions')
      .select('field_key,display_name')
      .eq('import_type', importType)
      .eq('active', true)
      .eq('is_deprecated', false),

    db.from('organization_custom_fields')
      .select('field_key,display_name')
      .eq('organization_id', orgId)
      .eq('import_type', importType)
      .eq('active', true),

    db.from('import_field_synonyms')
      .select('field_key,synonym')
      .eq('import_type', importType)
      .or(orgId ? `is_global.eq.true,organization_id.eq.${orgId}` : 'is_global.eq.true'),

    db.from('import_field_usage_stats')
      .select('source_column,target_field,mapping_count')
      .eq('organization_id', orgId)
      .eq('import_type', importType)
      .order('mapping_count', { ascending: false })
      .limit(1000),
  ])

  // Build field catalog: key → {display_name, synonyms[]}
  const fieldMap = new Map<string, CatalogField>()
  for (const f of [...(sysDefs.data ?? []), ...(customDefs.data ?? [])]) {
    fieldMap.set(f.field_key, { field_key: f.field_key, display_name: f.display_name, synonyms: [] })
  }
  for (const row of (synRows.data ?? []) as Array<{ field_key: string; synonym: string }>) {
    const entry = fieldMap.get(row.field_key)
    if (entry) entry.synonyms.push(row.synonym)
  }

  // Build usage history: normalized source_column → field_key with highest count
  const usageMap = new Map<string, string>()
  for (const u of (usageRows.data ?? []) as UsageStat[]) {
    const key = normalize(u.source_column)
    if (!usageMap.has(key)) usageMap.set(key, u.target_field)
  }

  // Fallback: also check the old import_field_dictionary table so existing
  // global synonym seeds still work if the catalog is not yet populated.
  const { data: legacyRows } = await db
    .from('import_field_dictionary')
    .select('source_alias, target_field, confidence')
    .eq('import_type', importType)
    .order('confidence', { ascending: false })
  const legacyDict: Array<{ source_alias: string; target_field: string; confidence: number }> = legacyRows ?? []

  const fields = Array.from(fieldMap.values())

  return sourceColumns.map(col => {
    const colNorm = normalize(col)
    const colLower = col.toLowerCase().trim()

    // 1. Usage history (org-specific, highest confidence)
    const historicalField = usageMap.get(colNorm)
    if (historicalField && fieldMap.has(historicalField)) {
      return { sourceColumn: col, suggestedField: historicalField, confidence: 0.97, method: 'usage_history' as const }
    }

    // 2. Exact synonym match
    for (const field of fields) {
      for (const syn of field.synonyms) {
        if (normalize(syn) === colNorm) {
          return { sourceColumn: col, suggestedField: field.field_key, confidence: 0.95, method: 'synonym_exact' as const }
        }
      }
    }

    // 3. Exact display_name match
    for (const field of fields) {
      if (field.display_name.toLowerCase() === colLower) {
        return { sourceColumn: col, suggestedField: field.field_key, confidence: 0.93, method: 'display_exact' as const }
      }
    }

    // 4. Exact field_key match
    for (const field of fields) {
      if (field.field_key.toLowerCase() === colLower) {
        return { sourceColumn: col, suggestedField: field.field_key, confidence: 0.90, method: 'key_exact' as const }
      }
    }

    // 5. Fuzzy synonym match (either string contains the other after normalization)
    let bestFuzzy: { field_key: string; confidence: number } | null = null
    for (const field of fields) {
      for (const syn of field.synonyms) {
        const synNorm = normalize(syn)
        if (colNorm.length >= 3 && synNorm.length >= 3 &&
            (colNorm.includes(synNorm) || synNorm.includes(colNorm))) {
          const score = Math.min(colNorm.length, synNorm.length) / Math.max(colNorm.length, synNorm.length)
          if (!bestFuzzy || score > bestFuzzy.confidence) {
            bestFuzzy = { field_key: field.field_key, confidence: score * 0.75 }
          }
        }
      }
    }
    if (bestFuzzy && bestFuzzy.confidence >= 0.4) {
      return { sourceColumn: col, suggestedField: bestFuzzy.field_key, confidence: bestFuzzy.confidence, method: 'synonym_fuzzy' as const }
    }

    // 6. Legacy dictionary fallback (import_field_dictionary)
    if (legacyDict.length > 0) {
      const exact = legacyDict.find(d => normalize(d.source_alias) === colNorm)
      if (exact) return { sourceColumn: col, suggestedField: exact.target_field, confidence: Number(exact.confidence) * 0.85, method: 'synonym_exact' as const }
      const fuzzy = legacyDict.find(d => {
        const dn = normalize(d.source_alias)
        return dn.length >= 3 && colNorm.length >= 3 && (colNorm.includes(dn) || dn.includes(colNorm))
      })
      if (fuzzy) return { sourceColumn: col, suggestedField: fuzzy.target_field, confidence: Number(fuzzy.confidence) * 0.6, method: 'synonym_fuzzy' as const }
    }

    return { sourceColumn: col, suggestedField: null, confidence: 0, method: 'none' as const }
  })
}

// Record confirmed mappings to improve future suggestions.
// Uses upsert_mapping_usage (M-029) to atomically increment counts.
export async function recordMappingUsage(
  orgId: string,
  importType: string,
  mapping: Record<string, string>,
  client: SupabaseServerClient
): Promise<void> {
  if (!orgId) return
  const db = client as any
  const entries = Object.entries(mapping).filter(([, tgt]) => tgt && tgt !== '__ignore__')
  await Promise.allSettled(
    entries.map(([src, tgt]) =>
      db.rpc('upsert_mapping_usage', { p_org: orgId, p_type: importType, p_src: src, p_tgt: tgt })
    )
  )
}
