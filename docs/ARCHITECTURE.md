# BOM Costing Platform — Architecture

**Status:** Proposed — pending approval  
**Last updated:** 2026-06-17

---

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        Browser                          │
│                  Next.js Frontend (App Router)          │
│              TypeScript · Tailwind · shadcn/ui          │
└────────────────────────┬────────────────────────────────┘
                         │ HTTPS
┌────────────────────────▼────────────────────────────────┐
│                  Next.js API Routes                      │
│                  /backend (Server Actions)               │
│            Business logic · Validation · Auth           │
└────────────────────────┬────────────────────────────────┘
                         │ Supabase JS Client (service role)
┌────────────────────────▼────────────────────────────────┐
│                       Supabase                           │
│  PostgreSQL (RLS) · Auth · Storage · Edge Functions      │
└─────────────────────────────────────────────────────────┘
```

## Monorepo Structure

```
bom-costing-platform/
├── frontend/                   # Next.js 14+ App Router
│   ├── app/                    # Routes and layouts
│   │   ├── (auth)/             # Login / signup pages
│   │   ├── (dashboard)/        # Authenticated app shell
│   │   │   ├── products/
│   │   │   ├── boms/
│   │   │   ├── components/
│   │   │   ├── suppliers/
│   │   │   └── reports/
│   │   └── api/                # API route handlers
│   ├── components/             # Shared UI components
│   │   ├── ui/                 # shadcn primitives
│   │   └── domain/             # BOM, cost, supplier widgets
│   ├── lib/                    # Supabase client, utilities
│   ├── types/                  # Shared TypeScript types
│   └── public/
│
├── backend/                    # Server-side business logic
│   ├── services/               # Cost roll-up, BOM operations
│   ├── validators/             # Zod schemas
│   └── supabase/               # Typed Supabase client wrappers
│
├── database/
│   └── migrations/             # Ordered SQL migrations (Supabase CLI)
│
├── docs/                       # Architecture and spec documents
│
└── tests/
    ├── unit/                   # Service logic tests (Vitest)
    ├── integration/            # DB tests against local Supabase
    └── e2e/                    # Playwright browser tests
```

## Technology Decisions

| Layer | Technology | Reason |
|-------|-----------|--------|
| Frontend framework | Next.js 14 (App Router) | SSR for initial load performance; server actions simplify auth-gated data fetching |
| UI library | Tailwind + shadcn/ui | Accessible primitives, no bloated component library dependency |
| Language | TypeScript (strict) | Type safety across full stack; shared types between frontend and backend |
| Database | Supabase PostgreSQL | Managed Postgres with built-in auth, RLS, and real-time |
| Auth | Supabase Auth | Handles sessions, JWTs, and integrates natively with RLS |
| ORM / Query | Supabase JS client (typed) | Auto-generated types from schema; avoids raw SQL in application code |
| Migrations | Supabase CLI (`supabase db push`) | Version-controlled, repeatable migrations |
| Testing (unit) | Vitest | Fast, ESM-native, compatible with Next.js ecosystem |
| Testing (e2e) | Playwright | Cross-browser, reliable for form-heavy workflows |
| Hosting | Vercel (frontend) + Supabase Cloud | Zero-config deployment for Next.js; Supabase managed infra |

## Data Flow: BOM Cost Roll-up

```
User triggers "Calculate Cost" on a BOM
  │
  ▼
API Route receives: bom_id, scenario_id
  │
  ▼
backend/services/costRollup.ts
  ├── Fetch all BOM lines (recursive, ordered by depth)
  ├── For each leaf component:
  │     Resolve unit price:
  │       1. scenario override (if exists)
  │       2. active supplier price (latest effective_from ≤ today)
  │       3. fallback: null → warn
  ├── Roll up: parent cost = Σ(child qty × child unit cost)
  ├── Apply overhead_pct and labor_rate from scenario
  └── Return structured cost breakdown
  │
  ▼
Response: { total, breakdown_by_line, warnings[] }
  │
  ▼
Frontend renders cost tree + PDF export
```

## Security Model

- **Authentication:** Supabase Auth (email/password + optional SSO). JWTs signed by Supabase.
- **Authorization:** PostgreSQL RLS policies enforce organization scoping on every table. The application server uses the `anon` key for user-context requests (letting RLS enforce rules) and `service_role` only in server-side jobs that require admin access — never exposed to the browser.
- **Audit trail:** A database trigger populates `audit_log` on every INSERT/UPDATE/DELETE across business tables.
- **Input validation:** All API inputs validated with Zod before reaching the database.

## Environment Configuration

| Variable | Where used | Notes |
|----------|-----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Frontend | Public — safe to expose |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Frontend | Public — RLS is the guard |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend server only | Never in client bundle |
| `DATABASE_URL` | Migration CLI only | Never in application code |
