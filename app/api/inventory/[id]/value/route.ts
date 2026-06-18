import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/backend/lib/supabase'
import { runInventoryValuation } from '@/backend/services/inventoryValuation'

type RouteParams = { params: { id: string } }

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const body = await request.json().catch(() => ({}))
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const result = await runInventoryValuation({
      snapshotId: params.id,
      force: body.force === true,
    }, client)

    return NextResponse.json({ data: result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Valuation failed'
    if (message.includes('approved')) return NextResponse.json({ error: message }, { status: 409 })
    if (message.includes('no inventory lines')) return NextResponse.json({ error: message }, { status: 422 })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
