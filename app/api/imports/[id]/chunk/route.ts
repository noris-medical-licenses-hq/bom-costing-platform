import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/backend/lib/supabase'
import { validateRows } from '@/backend/lib/importValidators'
import type { ImportType } from '@/backend/lib/importTypes'

const Schema = z.object({
  rows:      z.array(z.record(z.string())).min(1).max(2000),
  rowOffset: z.number().int().min(0),
})

const ROW_INSERT_BATCH = 500

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const orgIdResult = await client.rpc('auth_org_id').maybeSingle()
    const orgId = (orgIdResult.data as string | null) ?? ''

    const body = await request.json()
    const parsed = Schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
    }

    const { rows, rowOffset } = parsed.data
    const jobId = params.id

    const svc = createServiceSupabaseClient()
    const svcDb = svc as any

    // Load job to verify ownership and get importType + mapping
    const { data: job, error: jobErr } = await svcDb.from('import_jobs')
      .select('id, import_type, mapping, total_rows, processed_rows, valid_rows, warning_rows, error_rows, status, organization_id')
      .eq('id', jobId)
      .single()

    if (jobErr || !job) return NextResponse.json({ error: 'Import job not found' }, { status: 404 })
    if (job.organization_id !== orgId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (!['uploading', 'validating'].includes(job.status)) {
      return NextResponse.json({ error: `Job cannot accept chunks in status "${job.status}"` }, { status: 409 })
    }

    // Validate the chunk
    const mapping: Record<string, string> = (job.mapping as Record<string, string>) ?? {}
    const validated = validateRows(rows, mapping, job.import_type as ImportType)

    const validCount   = validated.filter(r => r.status === 'valid').length
    const warningCount = validated.filter(r => r.status === 'warning').length
    const errorCount   = validated.filter(r => r.status === 'error').length

    // Store rows in import_job_rows in batches
    const rowInserts = validated.map((r, localIdx) => ({
      import_job_id: jobId,
      row_number:    rowOffset + localIdx + 1,
      raw_data:      rows[localIdx] ?? {},
      mapped_data:   r.mappedData,
      status:        r.status,
      errors:        r.errors.length > 0 ? r.errors : null,
      warnings:      r.warnings.length > 0 ? r.warnings : null,
    }))

    for (let i = 0; i < rowInserts.length; i += ROW_INSERT_BATCH) {
      const { error: insertErr } = await svcDb.from('import_job_rows')
        .insert(rowInserts.slice(i, i + ROW_INSERT_BATCH))
      if (insertErr) throw new Error(`Row insert failed: ${insertErr.message}`)
    }

    // Update job progress (read-then-write; chunks are sent sequentially so no race condition)
    const newProcessed = (job.processed_rows ?? 0) + rows.length
    const newValid     = (job.valid_rows ?? 0) + validCount
    const newWarning   = (job.warning_rows ?? 0) + warningCount
    const newError     = (job.error_rows ?? 0) + errorCount
    const isComplete   = newProcessed >= (job.total_rows ?? 0)

    await svcDb.from('import_jobs').update({
      processed_rows: newProcessed,
      valid_rows:     newValid,
      warning_rows:   newWarning,
      error_rows:     newError,
      status:         isComplete ? 'validated' : 'uploading',
    }).eq('id', jobId)

    const sampleErrors = validated
      .filter(r => r.status === 'error')
      .slice(0, 10)
      .map(r => ({ row: r.rowNumber, errors: r.errors }))

    // Collect currency normalizations across the chunk and deduplicate by symbol.
    // Returned as file-level notes so the UI can show ONE banner instead of per-row warnings.
    const normMap = new Map<string, string>() // symbol → ISO
    for (const r of validated) {
      for (const note of r.normalizations ?? []) {
        const m = note.match(/^'(.+)' → (.+)$/)
        if (m) normMap.set(m[1], m[2])
      }
    }
    const currencyNotes = [...normMap.entries()].map(
      ([sym, iso]) => `Currency symbol '${sym}' normalized to ${iso}`
    )

    return NextResponse.json({
      processed:    rows.length,
      valid:        validCount,
      warnings:     warningCount,
      errors:       errorCount,
      totalProcessed: newProcessed,
      totalValid:     newValid,
      totalWarnings:  newWarning,
      totalErrors:    newError,
      isComplete,
      sampleErrors,
      currencyNotes,
    })
  } catch (err) {
    console.error('[POST /api/imports/[id]/chunk]', err)
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 })
  }
}
