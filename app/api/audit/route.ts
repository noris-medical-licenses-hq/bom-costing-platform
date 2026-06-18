import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/backend/lib/supabase'
import { listAuditLog } from '@/backend/repositories/auditRepository'

// Audit log is read-only. RLS ensures only admin and approver can access (OQ-05).
export async function GET(request: NextRequest) {
  try {
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const result = await listAuditLog({
      table_name: searchParams.get('table') ?? undefined,
      performed_by: searchParams.get('user') ?? undefined,
      event_type: searchParams.get('event_type') ?? undefined,
      from: searchParams.get('from') ?? undefined,
      to: searchParams.get('to') ?? undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 50,
      cursor: searchParams.get('cursor') ?? undefined,
    }, client)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof Error && 'code' in err && (err as { code?: string }).code === 'RLS_DENIED') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Failed to fetch audit log' }, { status: 500 })
  }
}
