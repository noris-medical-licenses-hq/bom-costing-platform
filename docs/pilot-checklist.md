# Pilot Readiness Checklist

Use this checklist before presenting to stakeholders or running a pilot with real data.

---

## Go / No-Go Criteria

### Must-Have (Go requires ALL ✅)

- [ ] **Auth working** — Login page accessible; users can sign in and see their session in the nav
- [ ] **RLS active** — All tables have row-level security enabled (see supabase-setup-checklist.md Step 4)
- [ ] **Seed data loaded** — At least the demo dataset from `scripts/seed.sql` is in the DB
- [ ] **Build passes** — `npm run build` exits 0 with no type errors
- [ ] **Tests pass** — `npm run test` exits 0 (208/208 tests)
- [ ] **Smoke test passes** — `npm run smoke-test` exits 0 against the live app URL
- [ ] **Service role key not exposed** — `npm run check-env` shows no NEXT_PUBLIC_* key matching service role key

### Should-Have (notable gaps if missing)

- [ ] **Validation center works** — Run validation for the demo org, get findings back
- [ ] **Calculation runs** — Run a cost calculation on the window BOM, get trace ID back
- [ ] **Trace viewer shows breakdown** — Load a trace ID, see BOM lines and rule evaluations
- [ ] **Audit log shows events** — At least one event visible after running calculation
- [ ] **Inventory snapshot created** — At least one snapshot created and valued

### Nice-to-Have (won't block pilot)

- [ ] Inventory valuation produces non-zero totals
- [ ] Multiple cost sets visible in Cost Sets page
- [ ] Demo walkthrough completed at least once end-to-end
- [ ] Known limitations communicated to audience (see known-limitations.md)

---

## Pre-Demo Steps

1. `npm run check-env` → all green
2. `npm run verify-migrations --live` → all migrations applied
3. `npm run apply-seed` → seed data confirmed
4. Open the app and log in with the demo account
5. Navigate to each page, confirm no 500 errors
6. Run a cost calculation, copy the Trace ID
7. Open the Trace Viewer, paste Trace ID, confirm breakdown loads

---

## Stakeholder Audience Notes

**For engineers**: Focus on the type-safe codebase, 208 tests, and rule-based explainability.

**For operations**: Focus on audit log completeness and validation center.

**For finance/pricing**: Focus on trace viewer (why does this component cost X?).

**For management**: Focus on dashboard, multi-site cost sets, and inventory valuation total.

---

## Recovery Plan If Demo Environment Breaks

1. Restart app: `npm run dev` (or redeploy)
2. Re-run smoke test: `npm run smoke-test`
3. If DB connection fails: check `NEXT_PUBLIC_SUPABASE_URL` in env vars
4. If auth fails: check `NEXT_PUBLIC_SUPABASE_ANON_KEY` matches the project
5. Fallback: show screenshots saved in `docs/screenshots/` (if prepared)
