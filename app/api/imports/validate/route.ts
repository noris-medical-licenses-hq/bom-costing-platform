import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/backend/lib/supabase'
import { createServiceSupabaseClient } from '@/backend/lib/supabase'
import { validateRows } from '@/backend/lib/importValidators'

const MAX_ROWS = 10_000

const Schema = z.object({
  importType: z.string(),
  fileName:   z.string().optional(),
  rows:       z.array(z.record(z.string())).max(MAX_ROWS),
  mapping:    z.record(z.string()), // sourceColumn → targetField | '__ignore__'
})

export async function POST(request: NextRequest) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const orgIdResult = await client.rpc('auth_org_id').maybeSingle()
    const orgId = (orgIdResult.data as string | null) ?? ''
    if (!orgId) return NextResponse.json({ error: 'No organization found' }, { status: 403 })

    const body = await request.json()
    const parsed = Schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
    }

    const { importType, fileName, rows, mapping } = parsed.data

    const validationResults = validateRows(rows, mapping, importType as never)
    const totalRows   = validationResults.length
    const validRows   = validationResults.filter(r => r.status === 'valid').length
    const warningRows = validationResults.filter(r => r.status === 'warning').length
    const errorRows   = validationResults.filter(r => r.status === 'error').length

    // Use service client to create job + rows (bypasses RLS on insert so we can populate all rows)
    const svc = createServiceSupabaseClient()
    const svcDb = svc as any

    const { data: job, error: jobErr } = await svcDb.from('import_jobs').insert({
      organization_id: orgId,
      import_type:     importType,
      file_name:       fileName ?? null,
      status:          'validated',
      total_rows:      totalRows,
      valid_rows:      validRows,
      warning_rows:    warningRows,
      error_rows:      errorRows,
      mapping,
      created_by:      user.id,
    }).select('id').single()

    if (jobErr || !job) {
      return NextResponse.json({ error: `Failed to create import job: ${jobErr?.message}` }, { status: 500 })
    }

    // Insert rows in chunks of 500 to avoid payload limits
    const CHUNK = 500
    for (let i = 0; i < validationResults.length; i += CHUNK) {
      const chunk = validationResults.slice(i, i + CHUNK)
      const { error: rowErr } = await svcDb.from('import_job_rows').insert(
        chunk.map(r => ({
          import_job_id: job.id,
          row_number:    r.rowNumber,
          raw_data:      rows[r.rowNumber - 1] ?? {},
          mapped_data:   r.mappedData,
          status:        r.status,
          errors:        r.errors.length  > 0 ? r.errors  : null,
          warnings:      r.warnings.length > 0 ? r.warnings : null,
        }))
      )
      if (rowErr) console.error('Row insert chunk error:', rowErr.message)
    }

    const sampleErrors = validationResults
      .filter(r => r.status === 'error')
      .slice(0, 10)
      .map(r => ({ row: r.rowNumber, errors: r.errors }))

    return NextResponse.json({
      jobId:       job.id,
      totalRows,
      validRows,
      warningRows,
      errorRows,
      sampleErrors,
    })
  } catch (err) {
    console.error('Validate route error:', err)
    return NextResponse.json({ error: 'Validation failed' }, { status: 500 })
  }
}
