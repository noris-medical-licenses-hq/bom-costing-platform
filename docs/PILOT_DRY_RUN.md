# Pilot Dry Run — Without Live Supabase

Step-by-step walkthrough of the pilot demo flow, assessed against current code. For each step: status, evidence, gaps.

---

## Assessment Key

| Status | Meaning |
|---|---|
| Ready | Code complete and tested |
| Partially Ready | Code exists; untested E2E; minor gaps |
| Blocked by Supabase | Requires live DB, auth, or RLS |
| Missing | Not yet implemented |

---

## Step 1 — Login / Signup

**Expected:** User navigates to `/login`, enters email + password, is redirected to dashboard.

| Check | Status | Evidence | Gap |
|---|---|---|---|
| Login page renders | Ready | `app/login/page.tsx` exists; builds cleanly | — |
| Email/password form | Ready | `handleSubmit` calls `supabase.auth.signInWithPassword` | — |
| Signup mode toggle | Ready | `mode` state toggle between 'login' and 'signup' | — |
| Auth redirect to `/` | Blocked by Supabase | `router.push('/')` on success — requires live auth | — |
| Nav shows email | Blocked by Supabase | `NavUser` fetches `/api/auth/me` — requires session | — |
| Sign out | Blocked by Supabase | `POST /api/auth/logout` calls `signOut()` — requires session | — |

**Action Required:** Provision Supabase project and create demo user.
**Owner:** Developer / DevOps
**Priority:** BLOCKER

---

## Step 2 — Create SKU

**Expected:** User navigates to SKU list, creates a new SKU via form or API.

| Check | Status | Evidence | Gap |
|---|---|---|---|
| SKU list page | Ready | `app/skus/page.tsx` renders SKU list from `GET /api/skus` | — |
| SKU API route | Ready | `app/api/skus/route.ts` has GET + POST | — |
| Auth guard on POST | Partially Ready | No explicit auth check in SKU POST (only calculate/validate have it) | Missing 401 guard on SKU CRUD routes |
| RLS prevents cross-tenant write | Blocked by Supabase | `skus_insert` policy requires `auth_org_id()` | — |
| Audit log on creation | Blocked by Supabase | Trigger on `skus` writes to `audit_log` | — |
| Demo SKUs available | Blocked by Supabase | Requires seed data applied | — |

**Action Required:** Add auth check to SKU CRUD API routes (LOW risk — see Phase 6 gaps). Run seed data.
**Owner:** Developer
**Priority:** HIGH

---

## Step 3 — Create BOM

**Expected:** User navigates to BOM Explorer, selects a make SKU, creates BOM with lines.

| Check | Status | Evidence | Gap |
|---|---|---|---|
| BOM page | Ready | `app/boms/page.tsx` renders BOM load by SKU UUID | — |
| BOM API route | Ready | `app/api/boms/route.ts` has GET | — |
| BOM line add | Partially Ready | Backend engine reads bom_lines; no create-line UI | No BOM line creation UI |
| Cycle detection | Ready | `detectBomCycle` tested (208 tests) | — |
| Demo BOMs available | Blocked by Supabase | Requires seed data applied | — |

**Action Required:** For pilot, use pre-seeded BOMs rather than live creation via UI.
**Owner:** Developer
**Priority:** MEDIUM (pilot can use seed BOMs)

---

## Step 4 — Run Validation

**Expected:** User navigates to Validation Center, clicks Run Validation, sees findings.

| Check | Status | Evidence | Gap |
|---|---|---|---|
| Validation page | Ready | `app/validation/page.tsx` renders validation form and results | — |
| Validation API | Ready | `POST /api/validate` has auth guard, Zod validation | — |
| All 14 rules coded | Ready | 61 validation tests passing | — |
| Results persisted | Blocked by Supabase | `validation_runs` + `validation_findings` require live DB | — |
| Demo scenario: clean validation | Blocked by Supabase | Requires seed data — all demo SKUs/BOMs should pass | — |

**Action Required:** Connect to Supabase, run seed, then trigger validation.
**Owner:** Developer
**Priority:** BLOCKER

---

## Step 5 — Fix Validation Issue

**Expected:** User sees a finding (e.g., warning about unqualified supplier), navigates to the affected SKU, and resolves it.

| Check | Status | Evidence | Gap |
|---|---|---|---|
| Finding detail shows affected entity | Partially Ready | `validation_findings` has `sku_id`, `bom_version_id` fields | No link from finding to entity page |
| Navigate to SKU from finding | Missing | No deep-link from validation finding to SKU edit page | UI gap |
| Edit SKU to fix | Missing | No SKU edit form (only list and create) | SKU edit UI not built |
| Re-run validation to confirm fix | Ready | Can run validation again — finding should auto-resolve | — |

**Action Required:** For pilot, fix via Supabase SQL editor or acknowledge finding as "informational."
**Owner:** Developer
**Priority:** MEDIUM (workaround: direct DB edit for pilot)

---

## Step 6 — Calculate Product Cost

**Expected:** User selects BOM + cost set, clicks Calculate, receives trace ID and total cost.

| Check | Status | Evidence | Gap |
|---|---|---|---|
| BOM page has Run Calculation button | Ready | `app/boms/page.tsx` has calculate form | — |
| Calculate API | Ready | `POST /api/calculate` has auth guard, Zod, 422/404/500 handling | — |
| Cost engine all 6 stages | Ready | 208 tests covering all stages | — |
| Result shows trace ID | Ready | Returns `{ data: { trace_id, total_cost } }` | — |
| Trace link to viewer | Missing | No auto-link from calculation result to `/traces` page | User must copy-paste UUID |
| Auth required | Ready | `if (!user) return 401` | — |

**Action Required:** Connect to Supabase. After calculation, copy trace ID and paste into Trace Viewer.
**Owner:** Developer
**Priority:** MEDIUM (workaround: copy-paste UUID)

---

## Step 7 — Review Cost Trace

**Expected:** User navigates to Trace Viewer, pastes trace ID, sees BOM breakdown and rule evaluations.

| Check | Status | Evidence | Gap |
|---|---|---|---|
| Trace viewer page | Ready | `app/traces/page.tsx` renders trace header, lines, rules | — |
| Trace API GET `/api/traces/[id]` | Ready | Returns header | — |
| Lines API GET `/api/traces/[id]/lines` | Ready | Returns per-SKU breakdown | — |
| Rules API GET `/api/traces/[id]/rules` | Ready | Returns rule evaluation trace | — |
| UX: copy-paste UUID | Partially Ready | Works but requires manual UUID paste | No link from calculation result |
| Column names correct | Ready | Fixed to match `database.generated.ts` in Phase A | — |

**Action Required:** No changes needed. Works once Supabase is live.
**Owner:** —
**Priority:** BLOCKER (requires live Supabase)

---

## Step 8 — Create Inventory Snapshot

**Expected:** User navigates to Inventory page, creates a snapshot, adds lines.

| Check | Status | Evidence | Gap |
|---|---|---|---|
| Inventory page | Ready | `app/inventory/page.tsx` renders snapshot list | — |
| Snapshot create API | Ready | `POST /api/inventory/snapshots` | — |
| Snapshot line add | Partially Ready | API exists; no bulk import UI | Manual line-by-line entry only |
| Demo inventory data | Missing | Seed does not include inventory snapshot or lines | Must be created manually |

**Action Required:** Create snapshot manually after seed. Add lines for BER-WH1 raw materials.
**Owner:** Developer
**Priority:** MEDIUM (can demo with empty snapshot)

---

## Step 9 — Run Inventory Valuation

**Expected:** User clicks "Value Snapshot", sees per-warehouse and global cost totals.

| Check | Status | Evidence | Gap |
|---|---|---|---|
| Valuation API | Ready | `POST /api/inventory/[id]/value` | — |
| Aggregation engine | Ready | Per-warehouse, per-family, global totals — tested | — |
| Cost_set_snapshot JSONB | Ready | Schema: `cost_set_snapshot` freezes the cost at valuation time | — |
| UI shows results | Partially Ready | Inventory page shows snapshot list; result display not verified | — |
| Live data required | Blocked by Supabase | Requires approved snapshot + cost items | — |

**Action Required:** Connect to Supabase, create snapshot lines, run valuation.
**Owner:** Developer
**Priority:** BLOCKER (requires live Supabase)

---

## Step 10 — Review Audit Trail

**Expected:** User navigates to Audit Log, filters by event type, sees all mutations.

| Check | Status | Evidence | Gap |
|---|---|---|---|
| Audit log page | Ready | `app/audit/page.tsx` renders audit log with filters | — |
| Audit log API | Ready | `GET /api/audit` with event_type filter | — |
| Role restriction | Ready | RLS: only `approver` and `admin` can SELECT | — |
| Triggers cover all tables | Ready | 21 triggers in M-022 | Calculation/validation tables excluded (intentional) |
| Demo audit entries | Blocked by Supabase | Requires actual mutations to exist | — |

**Action Required:** Demo user must have role `approver` or `admin` to see audit log. Set in profile after seed.
**Owner:** Developer / Operations
**Priority:** MEDIUM (set role via Supabase SQL editor)

---

## Dry Run Summary

| Step | Status |
|---|---|
| 1. Login | Blocked by Supabase |
| 2. Create SKU | Partially Ready |
| 3. Create BOM | Partially Ready (use seed) |
| 4. Run validation | Blocked by Supabase |
| 5. Fix validation issue | Missing (edit UI) |
| 6. Calculate cost | Blocked by Supabase |
| 7. Review trace | Blocked by Supabase |
| 8. Create snapshot | Partially Ready |
| 9. Run valuation | Blocked by Supabase |
| 10. Review audit trail | Blocked by Supabase |

**Blockers are exclusively runtime (Supabase not yet connected).** No missing business logic blockers — all calculation, validation, and trace logic is implemented and tested.

---

## Pre-Pilot Action List

| Priority | Action | Owner |
|---|---|---|
| BLOCKER | Provision Supabase project and apply 23 migrations | Developer/DevOps |
| BLOCKER | Create demo organization in `organizations` table | Developer |
| BLOCKER | Create demo user via Supabase Auth signup | Developer |
| BLOCKER | Create `profiles` row for demo user with correct org + role=admin | Developer |
| BLOCKER | Run `npm run apply-seed` to load demo data | Developer |
| BLOCKER | Verify `npm run smoke-test` passes against live URL | Developer |
| HIGH | Add auth guard (401) to SKU/BOM CRUD API routes | Developer |
| MEDIUM | Create inventory snapshot + lines for BER-WH1 | Developer/Operations |
| LOW | Add navigation link from calculation result to trace viewer | Developer |
| LOW | Add SKU edit form | Developer |
