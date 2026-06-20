/**
 * GET /api/imports/export-issues?jobId=<uuid>
 *
 * Downloads an Excel file of all error/warning rows for a given import job.
 * BG-020: Universal Failure Export Framework — Import Center.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/backend/lib/supabase'
import { issueExcelResponse, type IssueRow } from '@/backend/lib/excelExport'

export async function GET(request: NextRequest) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const jobId = new URL(request.url).searchParams.get('jobId')
    if (!jobId) return NextResponse.json({ error: 'jobId is required' }, { status: 400 })

    const db = client as any

    // Load job metadata
    const { data: job, error: jobErr } = await db
      .from('import_jobs')
      .select('id, file_name, import_type, created_at')
      .eq('id', jobId)
      .single()

    if (jobErr || !job) return NextResponse.json({ error: 'Import job not found' }, { status: 404 })

    // Load all error and warning rows
    const { data: rows, error: rowErr } = await db
      .from('import_job_rows')
      .select('id, row_number, status, errors, warnings, mapped_data')
      .eq('import_job_id', jobId)
      .in('status', ['error', 'warning'])
      .order('row_number', { ascending: true })
      .limit(10000)

    if (rowErr) return NextResponse.json({ error: rowErr.message }, { status: 500 })

    const now       = new Date().toISOString()
    const fileName  = (job.file_name as string | null) ?? undefined
    const issues: IssueRow[] = []

    for (const row of (rows ?? []) as any[]) {
      const errors   = (row.errors   as string[] | null) ?? []
      const warnings = (row.warnings as string[] | null) ?? []
      const mapped   = (row.mapped_data as Record<string, unknown> | null) ?? {}
      // Resolve SKU from whichever field is present in the mapped data
      const sku      = String(
        mapped['sku'] ?? mapped['part_number'] ?? mapped['sku_part_number'] ?? mapped['parent_sku'] ?? ''
      ) || undefined

      if (errors.length > 0) {
        for (const msg of errors) {
          issues.push({
            severity:      'CRITICAL',
            module:        'Import',
            entity_type:   job.import_type,
            entity_id:     row.id,
            sku,
            row_number:    row.row_number,
            file_name:     fileName,
            import_job:    jobId,
            import_row:    row.id,
            error_code:    `ROW_${row.row_number}_ERROR`,
            error_message: msg,
            suggested_fix: 'Correct the source file and re-import',
            detected_at:   now,
          })
        }
      }

      if (warnings.length > 0) {
        for (const msg of warnings) {
          // AUTO_CREATED_SKU warnings get a distinct error_code for filtering.
          const isAutoCreate = msg.includes('automatically created during BOM import')
          issues.push({
            severity:      'WARNING',
            module:        'Import',
            entity_type:   job.import_type,
            entity_id:     row.id,
            sku,
            row_number:    row.row_number,
            file_name:     fileName,
            import_job:    jobId,
            import_row:    row.id,
            error_code:    isAutoCreate ? 'AUTO_CREATED_SKU' : `ROW_${row.row_number}_WARNING`,
            error_message: msg,
            suggested_fix: isAutoCreate
              ? 'Review the auto-created SKU in SKU Master and set make_buy if classification_status is needs_review'
              : 'Review and confirm this is acceptable',
            detected_at:   now,
          })
        }
      }
    }

    const safeName = (job.file_name as string).replace(/[^a-z0-9_-]/gi, '_').slice(0, 40)
    return issueExcelResponse(
      [{ name: 'Import Issues', issues }],
      `import-issues-${safeName}`
    )
  } catch (err) {
    console.error('[GET /api/imports/export-issues]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
