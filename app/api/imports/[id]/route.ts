import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/backend/lib/supabase'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const db = client as any
    const { data: job } = await db
      .from('import_jobs')
      .select('*')
      .eq('id', params.id)
      .single()

    if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data: rows } = await db
      .from('import_job_rows')
      .select('row_number, status, errors, warnings, mapped_data')
      .eq('import_job_id', params.id)
      .order('row_number')
      .limit(100)

    return NextResponse.json({ data: { ...job, rows } })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch import job' }, { status: 500 })
  }
}
