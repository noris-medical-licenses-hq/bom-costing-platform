import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/backend/lib/supabase'
import { approveRuleException } from '@/backend/repositories/ruleRepository'
import { DbError } from '@/backend/repositories/base/errors'

type RouteParams = { params: { id: string } }

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const client = await createServerSupabaseClient()
    const { data, error } = await client.from('rule_exceptions').select('*').eq('id', params.id).single()
    if (error || !data) return NextResponse.json({ error: 'Exception not found' }, { status: 404 })
    return NextResponse.json({ data })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch exception' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const body = await request.json()
    if (body.action !== 'approve') {
      return NextResponse.json({ error: 'Invalid action. Use { "action": "approve" }' }, { status: 400 })
    }
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const exception = await approveRuleException(params.id, user.id, client)
    return NextResponse.json({ data: exception })
  } catch (err) {
    if (err instanceof DbError && err.code === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Exception not found or not in approvable state' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Failed to approve exception' }, { status: 500 })
  }
}
