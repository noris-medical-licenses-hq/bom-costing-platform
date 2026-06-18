# Auth Implementation Plan

**Date:** 2026-06-18  
**Stack:** Supabase Auth + Next.js 14 App Router + @supabase/ssr

---

## Overview

Auth is not implementable until Supabase is provisioned. This document defines the exact implementation steps for when Supabase is available.

---

## 1. Signup Flow

```
User submits email + password + full_name
  │
  ▼ app/api/auth/signup/route.ts (or server action)
  ├── Validate input (Zod: email, password min-length, full_name)
  ├── Call supabase.auth.signUp({ email, password })
  │   → Supabase creates auth.users row
  │   → Sends confirmation email (if email confirm enabled)
  │
  ▼ Supabase Auth Webhook → /api/auth/webhook
  ├── Receives user.created event
  ├── Uses service_role client (bypasses RLS)
  ├── Checks if organization exists for user's email domain
  ├── Creates profiles row:
  │     { user_id, organization_id, email, full_name, role: 'viewer' }
  │     (default role is 'viewer' — admin must elevate)
  └── Returns 200 OK to Supabase
```

**Files to create:**
- `app/api/auth/webhook/route.ts` — handles Supabase Auth webhooks
- `app/(auth)/signup/page.tsx` — signup form
- `app/(auth)/signup/actions.ts` — server action for signUp

---

## 2. Login Flow

```
User submits email + password
  │
  ▼ app/(auth)/login/page.tsx
  ├── Call supabase.auth.signInWithPassword({ email, password })
  │   → Supabase validates credentials
  │   → Sets session cookies (via @supabase/ssr middleware)
  │
  ▼ middleware.ts refreshes session on every request
  ├── If session valid → allow request
  └── If no session → redirect to /login
```

**Files to create:**
- `app/(auth)/login/page.tsx` — login form
- `app/(auth)/login/actions.ts` — server action for signIn
- `middleware.ts` — session refresh on every request (required by @supabase/ssr)

**Middleware pattern (required for Supabase SSR):**
```typescript
// middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { ... }, setAll(cookiesToSet) { ... } } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user && !request.nextUrl.pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  return response
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] }
```

---

## 3. Session Validation Flow

```
Every server action or API route call:
  │
  ▼ createServerSupabaseClient() (backend/lib/supabase.ts)
  ├── Reads JWT from cookie
  ├── Passes JWT to Supabase for RLS evaluation
  │   → auth.uid() = user's UUID
  │   → auth_org_id() = profiles.organization_id for this user
  │   → auth_user_role() = profiles.role for this user
  │
  ├── RLS policy evaluates against these values
  └── Returns only rows matching the user's organization
```

No additional session validation needed — Supabase RLS + cookie-based JWT handles it.

---

## 4. Profile Creation Approach

**Method:** Supabase Auth Database Webhook (not a client-side hook)

```
Setup in Supabase Dashboard:
  Database > Webhooks > Create new webhook
    Table: auth.users
    Event: INSERT
    URL: https://YOUR_DOMAIN/api/auth/webhook
    HTTP headers: { Authorization: Bearer WEBHOOK_SECRET }
```

**Webhook handler pseudocode:**
```typescript
// app/api/auth/webhook/route.ts
export async function POST(req: NextRequest) {
  const secret = req.headers.get('authorization')
  if (secret !== `Bearer ${process.env.WEBHOOK_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  const { type, record } = await req.json()
  if (type !== 'INSERT') return new Response('OK')

  const serviceClient = createServiceSupabaseClient()
  // Determine organization from email domain or use a default org
  // For single-org MVP: use a fixed organization_id from env var
  await serviceClient.from('profiles').insert({
    user_id: record.id,
    organization_id: process.env.DEFAULT_ORGANIZATION_ID,
    email: record.email,
    full_name: record.user_metadata?.full_name ?? null,
    role: 'viewer',  // always start as viewer
    is_active: true,
  })
  return new Response('OK')
}
```

**Add to .env.local.example:**
```
WEBHOOK_SECRET=your_random_webhook_secret_here
DEFAULT_ORGANIZATION_ID=your_first_org_uuid_here
```

---

## 5. RLS Dependency

RLS policies use `auth_org_id()` which reads from `profiles`. This means:
1. `profiles` row MUST exist before any RLS-protected query can succeed.
2. The webhook must fire and complete before the user can make any data requests.
3. Test: sign up → check if profiles row was created before testing any API route.

---

## 6. Required Environment Variables (Auth-specific)

| Variable | Purpose |
|---------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Auth endpoint |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | signInWithPassword, signUp |
| `SUPABASE_SERVICE_ROLE_KEY` | Webhook handler (profile creation) |
| `WEBHOOK_SECRET` | Verify webhook authenticity |
| `DEFAULT_ORGANIZATION_ID` | MVP: single org, fixed ID |

---

## 7. Middleware Requirements

Next.js middleware MUST be configured to refresh Supabase sessions on every request. Without this, server components lose their auth context. See pattern in §2 above.

The `matcher` should exclude static files but cover all pages and API routes.

---

## 8. Acceptance Criteria (verify after Supabase is live)

- [ ] `POST /api/auth/signup` with valid email/password → Supabase user created
- [ ] Webhook fires → profiles row created with role='viewer'
- [ ] `POST /api/auth/login` with valid credentials → session cookie set
- [ ] `GET /api/skus` with session cookie → returns `[]` (not 401)
- [ ] `GET /api/skus` without session cookie → returns `401`
- [ ] `POST /api/skus` as viewer → returns `403`
- [ ] `POST /api/skus` as editor → returns `201`
- [ ] `GET /api/audit` as viewer → returns `403`
- [ ] `GET /api/audit` as approver → returns `200`
- [ ] Two orgs: user from org A cannot see org B's SKUs

---

## 9. Test Plan (once Supabase available)

See `docs/TEST_STRATEGY.md §2C — RLS Integration Tests` for the full test matrix covering:
- Org isolation
- Role-based access
- audit_log protection
- Session expiry handling
