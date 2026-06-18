import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/backend/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const importType = searchParams.get('type')
    const limit      = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200)

    const db = client as any
    let query = db
      .from('import_jobs')
      .select('id, import_type, file_name, status, total_rows, valid_rows, warning_rows, error_rows, created_at, completed_at, created_by')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (importType) query = query.eq('import_type', importType)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ data })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch import jobs' }, { status: 500 })
  }
}
