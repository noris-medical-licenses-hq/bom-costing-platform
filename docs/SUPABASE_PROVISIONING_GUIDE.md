# Supabase Provisioning Guide

**For:** Developer running migrations for the first time  
**Date:** 2026-06-18  
**Docker required:** Yes (for local path) / No (for remote Supabase path)

---

## Prerequisites

```bash
# 1. Node.js 20+
node --version  # must be >= 20.0.0

# 2. npm 10+ (included with Node 20)
npm --version

# 3. Supabase CLI
npm install -g supabase
supabase --version  # must be >= 1.170.0

# 4. Docker Desktop (for LOCAL path only)
docker --version   # skip if using remote Supabase
```

---

## Path A — Local Development (Docker Required)

```bash
# Step 1: Initialize Supabase (if not already done)
# Run from repo root
supabase init

# Expected: creates supabase/ folder with config.toml

# Step 2: Start local Supabase
supabase start

# Expected output:
#   Started supabase local development setup.
#   API URL: http://127.0.0.1:54321
#   DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
#   Studio URL: http://127.0.0.1:54323
#   Anon key: eyJ...
#   Service role key: eyJ...

# Step 3: Copy the keys to .env.local
cp .env.local.example .env.local
# Edit .env.local with the values from supabase start output:
#   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from above>
#   SUPABASE_SERVICE_ROLE_KEY=<service_role key from above>
#   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres

# Step 4: Apply all migrations
supabase db push

# Expected: Applies M-001 through M-023 in order
# Watch for: any ERROR output — fix before continuing

# Step 5: Verify migrations
supabase db diff
# Expected: "No schema changes detected"

# Step 6: Generate TypeScript types
npm run db:generate-types
# Expected: overwrites backend/types/database.generated.ts
# Commit the generated file if it differs from the placeholder

# Step 7: Verify auth helper functions
# Open Supabase Studio: http://127.0.0.1:54323
# Go to SQL Editor and run:
SELECT auth_org_id();         -- should return NULL (no session)
SELECT auth_user_role();      -- should return NULL
SELECT auth_has_role(ARRAY['admin']);  -- should return false
# All should run without errors

# Step 8: Start the dev server
npm run dev
# Open: http://localhost:3000
```

### Expected Success Indicators (Local)
- `supabase db push` exits 0 with no errors
- Supabase Studio shows all 32 tables in Table Editor
- All 32 tables show "RLS enabled" in Studio
- `npm run db:generate-types` produces a non-empty .ts file
- `npm run dev` starts without errors
- `GET http://localhost:3000/api/skus` returns `{"data":[]}` (empty, not 401/500)

---

## Path B — Remote Supabase Project (No Docker Required)

```bash
# Step 1: Create project at https://app.supabase.com
# - Choose region: EU (Frankfurt) for Noris Medical / GDPR compliance
# - Note your project reference (e.g., abcdefghijkl)
# - Note your project password

# Step 2: Link CLI to project
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# Step 3: Set up .env.local
# Get values from: Supabase Dashboard > Project Settings > API
cp .env.local.example .env.local
# Fill in:
#   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from dashboard>
#   SUPABASE_SERVICE_ROLE_KEY=<service_role key from dashboard>
#   DATABASE_URL=<Connection string from Dashboard > Database > Connection string>

# Step 4: Apply migrations to remote
supabase db push --linked

# Step 5: Generate TypeScript types from remote
npx supabase gen types typescript --project-id YOUR_PROJECT_REF > backend/types/database.generated.ts

# Step 6: Start dev server
npm run dev
```

### Expected Success Indicators (Remote)
- Dashboard shows 32 tables under Table Editor
- Authentication > Policies shows policies for each table
- `GET https://YOUR_PROJECT_REF.supabase.co/rest/v1/skus` (with anon key header) returns `[]`

---

## Environment Variables Reference

| Variable | Required | Where | Notes |
|---------|---------|-------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Frontend + Backend | Safe to expose to browser |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Frontend + Backend | Safe; RLS is the guard |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (server) | Backend only | NEVER expose to browser |
| `DATABASE_URL` | CLI only | supabase CLI | NEVER import in application code |

---

## Common Errors and Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `relation "auth.users" does not exist` | Supabase not fully initialized | Run `supabase start` and wait for all services |
| `ERROR: function auth_org_id() does not exist` | M-003 not applied | Check migration order; re-run `supabase db push` |
| `ERROR: duplicate key value violates unique constraint` | Migration already partially applied | Run `supabase db reset` on local; on remote, check which migrations ran |
| `permission denied for schema auth` | Running migration as wrong user | Use Supabase CLI (`supabase db push`), not direct psql as limited user |
| `RLS policy violation on audit_log` | Application trying to write audit_log directly | Never INSERT into audit_log from application — the trigger does it |
| `SECURITY DEFINER function cannot be created` | Insufficient privileges | Always use Supabase CLI to apply migrations, not a manual connection |
| TypeScript errors after `gen types` | Generated types differ from manual placeholder | Normal — replace and fix any TS errors in repositories |

---

## Migration Application Checklist

Run through this checklist after `supabase db push`:

- [ ] `supabase db diff` returns "No schema changes detected"
- [ ] 32 tables visible in Studio Table Editor
- [ ] All 32 tables show RLS enabled (green lock icon in Studio)
- [ ] Audit log trigger exists: check Studio > Database > Triggers — should show 23 triggers
- [ ] Auth helper functions exist: SQL Editor: `SELECT routine_name FROM information_schema.routines WHERE routine_name LIKE 'auth_%'`
- [ ] Indexes present: `SELECT indexname FROM pg_indexes WHERE schemaname='public' ORDER BY indexname` — should return 60+ rows
- [ ] Partial unique index exists: `SELECT indexname FROM pg_indexes WHERE indexname='bom_versions_one_approved_per_bom'`
- [ ] Deferred FK on organizations: `SELECT constraint_name FROM information_schema.table_constraints WHERE table_name='organizations' AND constraint_type='FOREIGN KEY'`

---

## Type Generation Checklist

After `npm run db:generate-types`:

- [ ] File `backend/types/database.generated.ts` exists and is non-empty (> 1KB)
- [ ] All 32 table names appear in the generated file
- [ ] `Tables<'skus'>` type compiles without errors
- [ ] Commit the generated file to git (but don't edit it manually)

---

## Rollback / Cleanup Instructions

### Local environment:
```bash
supabase stop          # stop containers
supabase db reset      # drop and recreate local DB, re-apply migrations
```

### Remote (staging):
- Snapshot the database before applying new migrations (Supabase Dashboard > Database > Backups)
- To roll back a specific migration: create a new migration that reverses the changes

### Remote (production):
- NEVER run migrations directly in production without staging validation first
- Use Supabase Dashboard > Database > Backups > Create manual backup before any migration run
