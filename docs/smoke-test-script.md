# Smoke Test Script

Manual verification steps to run after each deployment or environment setup.

For automated smoke testing: `npm run smoke-test` (requires app running at localhost:3000 or set `SMOKE_TEST_BASE_URL`).

---

## 1. Environment Check

```bash
npm run check-env
```
Expected: `✅ Environment check passed.`

---

## 2. Migration Verification

```bash
npm run check-migrations         # static (no DB required)
npm run verify-migrations --live # needs SUPABASE_DB_URL
```
Expected: all files pass naming and sequence checks.

---

## 3. Build Verification

```bash
npm run typecheck && npm run build
```
Expected: 0 errors, 23 routes compiled.

---

## 4. Test Suite

```bash
npm run test
```
Expected: 208/208 tests passing.

---

## 5. Manual UI Verification

Open the app at the correct URL and verify each step:

### 5.1 Auth
- [ ] Navigate to `/login` → see login form
- [ ] Enter valid credentials → redirected to `/` (Dashboard)
- [ ] Check nav bar shows email address and Sign out button
- [ ] Click Sign out → redirected back to `/login`

### 5.2 Dashboard
- [ ] Navigate to `/` → see 7 cards (SKUs, BOMs, Cost Sets, Validation, Inventory, Traces, Audit)
- [ ] Click each card → correct page opens

### 5.3 SKU Management
- [ ] Navigate to `/skus` → see SKU list (or empty state)
- [ ] Filter by status: `active` → list updates
- [ ] If seed data loaded: see 10 SKUs from the Noris Medical demo set

### 5.4 BOM Explorer
- [ ] Navigate to `/boms`
- [ ] Enter a make SKU's UUID → click Load BOM
- [ ] See BOM structure, version status, and Run Calculation button

### 5.5 Validation Center
- [ ] Navigate to `/validation`
- [ ] Click Run Validation (organization scope)
- [ ] See findings table with rule codes and severities

### 5.6 Cost Sets
- [ ] Navigate to `/cost-sets`
- [ ] See cost set list (Site A Berlin, Site B Munich if seed applied)
- [ ] Click a cost set → see cost items in right panel

### 5.7 Inventory Valuation
- [ ] Navigate to `/inventory`
- [ ] Create a snapshot or select existing
- [ ] See snapshot list

### 5.8 Trace Viewer
- [ ] Navigate to `/traces`
- [ ] Paste a Trace UUID (from a previous calculation)
- [ ] Click Load Trace → see header, BOM breakdown, and rule evaluations

### 5.9 Audit Log
- [ ] Navigate to `/audit`
- [ ] See event list
- [ ] Filter by event type (e.g., `calculate`) → results update
- [ ] Click a row → see expanded metadata

---

## 6. API Smoke Test

```bash
npm run smoke-test
```

Or manually:
```bash
curl -s http://localhost:3000/api/skus | python3 -m json.tool
curl -s http://localhost:3000/api/boms | python3 -m json.tool
curl -s http://localhost:3000/api/cost-sets | python3 -m json.tool
curl -s http://localhost:3000/api/traces/nonexistent-id  # expect 404
```

---

## Pass / Fail Criteria

| Check | Pass |
|---|---|
| Environment check | All required vars present, no security issues |
| Build | Exit 0, 0 type errors |
| Tests | 208/208 passing |
| Login/logout | Works without error |
| All pages load | No 500 errors |
| Validation center returns results | At least 1 finding or "no issues" |
| API smoke test | All endpoints return expected status codes |
