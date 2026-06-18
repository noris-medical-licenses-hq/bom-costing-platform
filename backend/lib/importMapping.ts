import type { SupabaseServerClient } from './supabase'
import type { ImportType } from './importTypes'

export interface ColumnSuggestion {
  sourceColumn: string
  suggestedField: string | null
  confidence: number
  method: 'dictionary_exact' | 'dictionary_fuzzy' | 'none'
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s_\-\."']/g, '').replace(/מק"ט/g, 'מקט')
}

export async function suggestMappings(
  sourceColumns: string[],
  importType: ImportType,
  client: SupabaseServerClient
): Promise<ColumnSuggestion[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = client as any
  const { data: dictRows } = await db
    .from('import_field_dictionary')
    .select('source_alias, target_field, confidence')
    .eq('import_type', importType)
    .order('confidence', { ascending: false })

  const dict: Array<{ source_alias: string; target_field: string; confidence: number }> = dictRows ?? []

  return sourceColumns.map(col => {
    const colNorm = normalize(col)

    const exact = dict.find(d => normalize(d.source_alias) === colNorm)
    if (exact) {
      return {
        sourceColumn: col,
        suggestedField: exact.target_field,
        confidence: Number(exact.confidence),
        method: 'dictionary_exact' as const,
      }
    }

    const fuzzy = dict.find(d => {
      const dn = normalize(d.source_alias)
      return colNorm.includes(dn) || dn.includes(colNorm)
    })
    if (fuzzy) {
      return {
        sourceColumn: col,
        suggestedField: fuzzy.target_field,
        confidence: Number(fuzzy.confidence) * 0.8,
        method: 'dictionary_fuzzy' as const,
      }
    }

    return { sourceColumn: col, suggestedField: null, confidence: 0, method: 'none' as const }
  })
}
