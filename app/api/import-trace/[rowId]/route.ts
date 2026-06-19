import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/backend/lib/supabase'

// GET /api/import-trace/[rowId]
// Given an import_job_row_id, return full trace: which file, which job,
// which row, who imported it, and what the raw data was.
// Used by SKU/BOM/Cost/Inventory screens for "Imported From" trace lookup.

type RouteParams = { params: { rowId: string } }

export async function GET(_: NextRequest, { params }: RouteParams) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const db = client as any

    const { data: row, error } = await db
      .from('import_job_rows')
      .select(`
        id,
        row_number,
        status,
        mapped_data,
        import_jobs(
          id,
          file_name,
          import_type,
          status,
          created_at,
          profiles!import_jobs_created_by_fkey(full_name, email)
        )
      `)
      .eq('id', params.rowId)
      .single()

    if (error || !row) {
      return NextResponse.json({ error: 'Import row not found' }, { status: 404 })
    }

    const job = row.import_jobs
    const profile = job?.profiles

    return NextResponse.json({
      data: {
        import_job_row_id: row.id,
        row_number:        row.row_number,
        row_status:        row.status,
        import_job_id:     job?.id ?? null,
        file_name:         job?.file_name ?? null,
        import_type:       job?.import_type ?? null,
        imported_at:       job?.created_at ?? null,
        imported_by_name:  profile?.full_name ?? null,
        imported_by_email: profile?.email ?? null,
      },
    })
  } catch (err) {
    console.error('[GET /api/import-trace/[rowId]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
