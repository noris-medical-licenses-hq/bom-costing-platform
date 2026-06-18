# Observability and Traceability Review

For each major workflow: inputs, outputs, trace points, audit points, failure visibility, user-facing explanation, and developer troubleshooting path.

---

## 1. SKU Creation

**Inputs:** `part_number`, `name`, `item_type`, `make_buy`, `unit_of_measure`, `family_id`, `subfamily_id`, `default_supplier_id`, `status`

**Outputs:** New row in `skus`; audit log entry

**Trace Points:**
- App: `POST /api/skus` receives body, validates with Zod
- DB: `AFTER INSERT` trigger on `skus` writes to `audit_log`

**Audit Points:**
- `audit_log`: `event_type = 'data_insert'`, `table_name = 'skus'`, `new_values = {full row}`

**Failure Visibility:**
- `400`: Zod validation failure — `details` field contains field-level errors
- `401`: Not authenticated — check session
- `409`: `part_number` unique constraint violation — `{ error: 'Conflict' }`
- `500`: Unexpected error — message in `error` field; DB error is NOT exposed
- Audit trigger failure: `RAISE WARNING` in DB logs (does not block the INSERT)

**User-Facing Explanation:** "SKU PRF-PVC-080 was created successfully."

**Developer Troubleshooting:**
1. Check response body for `error` + `details`
2. Check `audit_log` table for the insert row
3. Check Supabase logs for trigger errors (`RAISE WARNING audit_log_trigger: ...`)

---

## 2. BOM Creation and Line Addition

**Inputs:** `sku_id` (must be a make-type SKU), then individual BOM lines with `sku_id`, `quantity`, `unit_of_measure`, `parent_line_id`

**Outputs:** New rows in `boms`, `bom_versions`, `bom_lines`; audit log entries for each

**Trace Points:**
- App: `POST /api/boms` creates header + initial version
- App: `POST /api/boms/[id]/lines` adds individual lines
- DB: Cycle detection logic in `detectBomCycle` called before each line insert
- DB: `AFTER INSERT` triggers on `boms`, `bom_versions`, `bom_lines`

**Audit Points:**
- `audit_log`: Three separate entries per BOM creation (bom, bom_version, first bom_line)
- Each line addition creates one `audit_log` entry

**Failure Visibility:**
- `422`: Cycle detected — error message contains "cycle" keyword
- `422`: BOM version is locked — cannot add lines to approved version
- `404`: Parent line not found
- `400`: `quantity <= 0` or missing required fields

**User-Facing Explanation:** "BOM WND-CASEMENT-080-DBL v1 created with 3 lines. Ready for approval."

**Developer Troubleshooting:**
1. Query `bom_lines WHERE bom_version_id = ?` to see current structure
2. Check `audit_log WHERE table_name = 'bom_lines'` for line add history
3. If cycle suspected: check for duplicate IDs in `bom_lines` for the same `bom_version_id`

---

## 3. Validation Run

**Inputs:** `scope_type`, `scope_id` (optional), `run_type`

**Outputs:** `validation_runs` row; `validation_findings` rows; returned JSON with `{ data: { run_id, errorCount, warningCount, findings[] } }`

**Trace Points:**
- App: `POST /api/validate` → `runValidationEngine`
- Engine: 14 validation rules run in sequence (V-BOM-001 through V-SKU-004)
- Each rule queries DB and returns findings
- Results persisted to `validation_runs` + `validation_findings`

**Audit Points:**
- No audit trigger on `validation_runs` or `validation_findings` (system-written tables)
- Validation run itself is the audit record — queryable by `run_id`

**Failure Visibility:**
- `401`: Not authenticated
- `400`: Invalid scope_type or missing scope_id for non-organization scope
- `500`: Engine crash — `{ error: 'Validation run failed' }`
- Individual rule failures: suppressed — rule returns empty findings array; no crash
- **Blind spot**: If a rule crashes silently, you get fewer findings than expected. No per-rule error logging currently.

**User-Facing Explanation:** "Validation completed: 2 warnings, 0 errors. Window BOM is ready for costing."

**Developer Troubleshooting:**
1. Check `validation_findings WHERE run_id = ?` for all findings
2. Check `validation_runs WHERE id = ?` for run metadata
3. If finding count seems wrong: add `console.error` in the specific rule's catch block
4. Rule codes are in `validation_findings.rule_code` — cross-reference with `remainingRules.test.ts`

---

## 4. Cost Calculation

**Inputs:** `bom_id`, `cost_set_id`, `valuation_date` (optional), `trace_level`

**Outputs:** `calculation_traces` row; `calculation_trace_lines` rows; `rule_execution_traces` rows; `cost_source_traces` rows; returned JSON with `{ data: { trace_id, total_cost, ... } }`

**Trace Points (6-stage pipeline):**
1. Stage 01: BOM load + cycle detection
2. Stage 02: Cost resolution (per leaf SKU — cost precedence hierarchy)
3. Stage 03: Rule evaluation (per leaf — condition matching)
4. Stage 04: Exception checking (per rule match — suppress if exception applies)
5. Stage 05: Cost rollup (DFS bottom-up)
6. Stage 06: Trace persistence

**Audit Points:**
- No audit trigger on trace tables (system-written, append-only)
- The trace itself is the authoritative audit record
- `calculation_traces.is_complete` flips to true after Stage 06

**Failure Visibility:**
- `422`: Validation errors block calculation — run validation first
- `422`: Cycle in BOM — `{ error: '..cycle..' }`
- `404`: No approved BOM version — `{ error: 'No approved BOM version' }`
- `401`: Not authenticated
- `500`: Unexpected error (Stage 06 persistence failure, etc.)

**Blind Spots:**
- If Stage 06 (trace persistence) fails, the calculation result is lost but no intermediate results are returned. The user sees a 500 with no partial data.
- Individual SKU cost resolution failures result in `has_missing_cost = true` on the trace line, but the calculation does not abort — this is by design.

**User-Facing Explanation:** "Calculation complete. Total cost: 48.23 EUR. Trace ID: [uuid]. 5% window premium applied."

**Developer Troubleshooting:**
1. Load trace: `GET /api/traces/[id]` → header
2. Load lines: `GET /api/traces/[id]/lines` → per-SKU breakdown
3. Load rules: `GET /api/traces/[id]/rules` → rule evaluation results
4. Check `has_missing_cost` on any line — indicates cost source not found
5. Check `cost_source_type` on trace lines to see which source resolved the cost

---

## 5. Inventory Valuation

**Inputs:** `snapshot_id` (an approved `inventory_snapshot`), `cost_set_id`

**Outputs:** `inventory_valuation_results` rows (per warehouse, per family, global total); updated `inventory_lines.unit_cost` and `total_value`

**Trace Points:**
- App: `POST /api/inventory/[id]/value`
- For each inventory line: resolve unit cost from cost set (same precedence hierarchy)
- Aggregate results by scope (global, warehouse, family, subfamily)
- Persist to `inventory_valuation_results`

**Audit Points:**
- `audit_log` trigger on `inventory_snapshots` status update (draft → valued)
- `audit_log` trigger on `inventory_lines` update (unit_cost set)
- No trigger on `inventory_valuation_results` (system table)

**Failure Visibility:**
- `404`: Snapshot not found
- `422`: Snapshot not in `approved` status — cannot value a draft snapshot
- `500`: Cost resolution failure
- **Blind spot**: Individual line cost resolution failures are not surfaced. If 1 of 100 lines has no cost, the total is wrong with no warning.

**Developer Troubleshooting:**
1. Check `inventory_lines WHERE snapshot_id = ? AND unit_cost IS NULL` — unresolved lines
2. Check `inventory_valuation_results WHERE snapshot_id = ?` for aggregates
3. Cross-reference with cost set to confirm relevant cost items exist

---

## 6. Audit Trail Review

**Inputs:** `event_type` filter, `table_name` filter, date range (UI only)

**Outputs:** `audit_log` rows matching filters

**Trace Points:**
- DB triggers (M-022) write on every INSERT/UPDATE/DELETE on 21 business tables
- `performed_by = auth.uid()` — NULL for service-role operations

**Audit Points:**
- The audit log IS the audit record. It is append-only and immutable (RLS blocks UPDATE/DELETE).
- `change_delta` JSONB: only changed columns are stored on UPDATE

**Failure Visibility:**
- Audit trigger failure does NOT block the business operation (`WHEN OTHERS` guard)
- If trigger fails: `RAISE WARNING` appears in DB logs
- App: `GET /api/audit` returns 401 for non-authenticated users; `403` if role is not approver/admin

**Blind Spots:**
- `performed_by` is NULL for background service-role operations — you cannot tell which user triggered a background job
- Calculation and validation runs are NOT in the audit log (they write to their own trace/run tables instead)
- No audit log entry for failed attempts (e.g., a failed login or a rejected RLS-blocked write)

**Developer Troubleshooting:**
1. Query `audit_log WHERE table_name = ? AND event_type = 'data_update'`
2. Use `change_delta` to see exactly what changed
3. `performed_by` → cross-reference with `profiles` to get name/email
4. If action is missing from log: check if the relevant trigger exists in `M-022`

---

## 7. Auth / Profile Creation

**Inputs:** `email`, `password` via Supabase Auth

**Outputs:** Row in `auth.users` (Supabase-managed); row in `profiles` (application-managed)

**Trace Points:**
- Supabase Auth: creates `auth.users` row on signup
- App: `POST /api/auth/me` returns profile on login
- Profile creation: must be done separately (no automatic trigger in MVP — see Blind Spots)

**Audit Points:**
- `audit_log` trigger on `profiles` INSERT fires if row is created via app code
- Supabase Auth logs (in dashboard) track login/logout events

**Failure Visibility:**
- Login fails: Supabase Auth returns error; login page shows `error` state
- Profile missing: `GET /api/auth/me` returns `{ user: { id, email, full_name: null, role: null, organization_id: null } }` (graceful degradation)
- No profile = no organization_id = all RLS policies deny access

**Blind Spots:**
- No automatic trigger to create `profiles` row when `auth.users` is created. This must be done manually or via a Supabase Auth webhook.
- If `profiles` row is missing, the user can log in but sees empty data (RLS allows nothing). The error is not obvious to the user.
- Session token expiry: middleware redirects to `/login` but the UX does not explain "your session expired."

**Developer Troubleshooting:**
1. Check `auth.users` in Supabase dashboard for the user's signup record
2. Check `profiles WHERE id = ?` to confirm profile exists with correct `organization_id`
3. If user sees empty data despite login: likely missing profile or wrong `organization_id`
4. Test RLS: use Supabase table editor with the user's JWT to query any table

---

## Summary: Observability Gaps and Recommended Fixes

| Gap | Severity | Fix |
|---|---|---|
| No automatic `profiles` creation on signup | High | Add Supabase Auth webhook or DB function on `auth.users` INSERT |
| Silent rule failures in validation engine | Medium | Add per-rule error logging to console/DB |
| Inventory line cost resolution failures not surfaced | Medium | Add `has_missing_cost` flag on `inventory_lines` |
| Missing `performed_by` for service-role operations | Low | Add `metadata` JSONB to audit_log for job context |
| No audit on failed write attempts | Low | Acceptable for MVP — RLS silently rejects |
| Session expiry UX not explained | Low | Add "Session expired, please log in" message on middleware redirect |
