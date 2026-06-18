import { createServerClient } from '@supabase/ssr'
import type { CookieOptions } from '@supabase/ssr'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { Database } from '../types/database.generated'

// Server client — uses the user's JWT from the cookie.
// RLS applies. Use this in server actions and API routes.
//
// NOTE: We cast to SupabaseClient<Database> because createServerClient's type
// declaration from @supabase/ssr passes Database['public'] in the SchemaName
// position of SupabaseClient (which expects a string), breaking all .from()
// type inference. The cast is safe — the runtime client is fully functional.
export async function createServerSupabaseClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set({ name, value, ...options })
          )
        },
      },
    }
  ) as unknown as SupabaseClient<Database>
}

// Service-role client — bypasses RLS.
// Use ONLY in: background jobs, Auth hooks, seeding.
// NEVER pass this client to repository methods that serve user requests.
export function createServiceSupabaseClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  }
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

export type SupabaseServerClient = Awaited<ReturnType<typeof createServerSupabaseClient>>
export type SupabaseServiceClient = ReturnType<typeof createServiceSupabaseClient>
