# Dev Readiness Report

**Date:** 2026-06-18  
**Environment:** Windows 11, no Docker available  

---

## Available Scripts

| Script | Command | Status | Notes |
|--------|---------|--------|-------|
| `dev` | `next dev` | 🔴 Blocked | Needs `npm install` first, then Supabase |
| `build` | `next build` | 🔴 Blocked | Needs `npm install` + dummy env vars |
| `lint` | `next lint` | 🔴 Blocked | Needs `npm install` |
| `typecheck` | `tsc --noEmit` | 🔴 Blocked | Needs `npm install` |
| `test` | `vitest run` | 🔴 Blocked | Needs `npm install` |
| `check-migrations` | `node scripts/check-migrations.js` | ✅ Working | No deps — Node.js only |
| `db:push` | `supabase db push` | 🔴 Blocked | Needs Supabase CLI + Docker |
| `db:generate-types` | `supabase gen types...` | 🔴 Blocked | Needs Supabase CLI + running project |

---

## Build Readiness

| Item | Status | Action Required |
|------|--------|----------------|
| package.json | ✅ Created | Run `npm install` |
| tsconfig.json | ✅ Created | — |
| next.config.ts | ✅ Created | — |
| .env.local | ❌ Missing | Copy `.env.local.example`, fill values |
| node_modules | ❌ Missing | `npm install` |
| .next (build cache) | ❌ Missing | `npm run build` after install |

---

## Type Readiness

| Item | Status | Notes |
|------|--------|-------|
| `backend/types/database.generated.ts` | 🟡 Placeholder | Manual types matching DATA_MODEL.md; replace with `supabase gen types` output |
| Repository types (Sku, BomLine, etc.) | ✅ Defined | Derived from database.generated.ts |
| Cost engine types | ✅ Defined | backend/services/costEngine/types.ts |
| Validation engine types | ✅ Defined | backend/services/validationEngine/types.ts |
| API route types (Zod schemas) | ✅ Defined | In each route.ts file |

The codebase will typecheck correctly once `npm install` runs. After `supabase gen types` replaces the placeholder types file, re-run `npm run typecheck` to catch any schema drift.

---

## Local Environment Blockers

1. **`npm install` not yet run** — no node_modules. Run manually: `npm install`
2. **No .env.local** — copy from `.env.local.example`, add dummy values for offline work:
   ```
   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
   NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy
   ```
3. **next lint requires ESLint config** — `eslint-config-next` is in devDependencies; will work after `npm install`

---

## Docker / Supabase Blockers

| Blocker | Impact | Resolution |
|---------|--------|-----------|
| Docker not available | Cannot run `supabase start` | Use Path B (remote Supabase) from SUPABASE_PROVISIONING_GUIDE.md |
| Supabase CLI not installed | Cannot run any `supabase` command | `npm install -g supabase` |
| No Supabase project | `db:generate-types` fails | Create project at app.supabase.com |
| No database | All API routes return 500 | Apply migrations (see SUPABASE_PROVISIONING_GUIDE.md) |

---

## Immediate Next Steps (No Docker)

```bash
# 1. Install dependencies
npm install

# 2. Create .env.local with dummy values for typecheck/lint
cp .env.local.example .env.local
# Edit .env.local: set dummy URL and anon key for offline checks

# 3. Typecheck
npm run typecheck

# 4. Run static migration check
npm run check-migrations

# 5. When remote Supabase is available:
#    Follow SUPABASE_PROVISIONING_GUIDE.md Path B
```

---

## Missing Scripts (Not Added — No Value Without DB)

The following scripts were intentionally NOT added because they require a live database:
- `db:seed` — no seed data needed for MVP (test data created via API)
- `db:studio` — use Supabase Dashboard instead
- `test:integration` — requires Supabase; add later when Docker available
