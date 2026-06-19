import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/backend/lib/supabase'
import { commitImport } from '@/backend/lib/importCommitter'
import type { RowValidationResult } from '@/backend/lib/importValidators'

const Schema = z.object({
  jobId:         z.string().uuid(),
  saveTemplate:  z.boolean().optional().default(false),
  templateName:  z.string().optional(),
})

// Max rows to load per page from import_job_rows.
// PostgREST default is 1000; this override handles up to 100k rows safely.
const PAGE_SIZE = 2000

export async function POST(request: NextRequest) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const orgIdResult = await client.rpc('auth_org_id').maybeSingle()
    const orgId = (orgIdResult.data as string | null) ?? ''
    if (!orgId) return NextResponse.json({ error: 'No organization found' }, { status: 403 })

    const roleResult = await (client as any).rpc('auth_user_role').maybeSingle()
    const callerRole = (roleResult.data as string | null) ?? ''
    if (!['editor', 'cost_analyst', 'procurement', 'approver', 'admin'].includes(callerRole)) {
      return NextResponse.json({ error: 'editor role or above required to commit imports' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = Schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
    }

    const { jobId, saveTemplate, templateName } = parsed.data

    const svc = createServiceSupabaseClient()
    const svcDb = svc as any

    // Verify job belongs to this org
    const { data: job } = await svcDb.from('import_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('organization_id', orgId)
      .single()

    if (!job) return NextResponse.json({ error: 'Import job not found' }, { status: 404 })
    if (job.status === 'committed') return NextResponse.json({ error: 'Import already committed' }, { status: 409 })
    if (!['validated', 'validating'].includes(job.status)) {
      return NextResponse.json({ error: `Job in status "${job.status}" cannot be committed` }, { status: 409 })
    }

    // ── Load all valid/warning rows using pagination ──────────────────────────
    // This replaces the old single query that was silently capped at 1000 rows.

    const allRows: RowValidationResult[] = []
    let offset = 0

    while (true) {
      const { data: page, error: pageErr } = await svcDb
        .from('import_job_rows')
        .select('row_number, mapped_data, status, errors, warnings')
        .eq('import_job_id', jobId)
        .in('status', ['valid', 'warning'])
        .order('row_number')
        .range(offset, offset + PAGE_SIZE - 1)

      if (pageErr) {
        return NextResponse.json({ error: `Failed to load rows: ${pageErr.message}` }, { status: 500 })
      }
      if (!page || page.length === 0) break

      for (const r of page as Array<{ row_number: number; status: string; errors: unknown; warnings: unknown; mapped_data: unknown }>) {
        allRows.push({
          rowNumber:  r.row_number,
          status:     r.status as 'valid' | 'warning' | 'error',
          errors:     (r.errors as string[] | null) ?? [],
          warnings:   (r.warnings as string[] | null) ?? [],
          mappedData: (r.mapped_data as Record<string, string | number | boolean | null>) ?? {},
        })
      }

      offset += PAGE_SIZE
      if (page.length < PAGE_SIZE) break
    }

    if (allRows.length === 0) {
      return NextResponse.json({ error: 'No valid rows found to commit' }, { status: 400 })
    }

    const commitResult = await commitImport(jobId, orgId, user.id, job.import_type as never, allRows, svc)

    // Update job status
    await svcDb.from('import_jobs').update({
      status:       'committed',
      valid_rows:   commitResult.committed,
      error_rows:   commitResult.errors.length,
      completed_at: new Date().toISOString(),
    }).eq('id', jobId)

    // Save template if requested
    if (saveTemplate && templateName?.trim() && job.mapping) {
      const { data: tmpl } = await svcDb.from('import_templates').insert({
        organization_id: orgId,
        name:            templateName.trim(),
        import_type:     job.import_type,
        created_by:      user.id,
      }).select('id').single()

      if (tmpl) {
        const mappingEntries = Object.entries(job.mapping as Record<string, string>)
          .filter(([, tgt]) => tgt && tgt !== '__ignore__')
          .map(([src, tgt]) => ({
            template_id:   tmpl.id,
            source_column: src,
            target_field:  tgt,
            confidence:    1.0,
          }))

        if (mappingEntries.length > 0) {
          await svcDb.from('import_template_mappings').insert(mappingEntries)
        }
      }
    }

    // Audit log
    await svcDb.from('audit_log').insert({
      organization_id: orgId,
      event_type:      'import_committed',
      event_category:  'data',
      table_name:      'import_jobs',
      record_id:       jobId,
      performed_by:    user.id,
      new_values: {
        import_type:     job.import_type,
        file_name:       job.file_name,
        committed:       commitResult.committed,
        skipped:         commitResult.skipped,
        errors:          commitResult.errors.length,
        total_rows_committed: allRows.length,
      },
    })

    return NextResponse.json({
      committed:      commitResult.committed,
      skipped:        commitResult.skipped,
      errors:         commitResult.errors,
      qualityMetrics: commitResult.qualityMetrics ?? null,
    })
  } catch (err) {
    console.error('Commit route error:', err)
    return NextResponse.json({ error: 'Commit failed' }, { status: 500 })
  }
}
