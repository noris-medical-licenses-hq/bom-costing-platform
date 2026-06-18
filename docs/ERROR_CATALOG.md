# Error Catalog

System-wide error reference for the BOM Costing Platform. Organized by category.

---

## Validation Engine Errors (V-xxx)

### V-BOM-001 — Make SKU Without BOM

| Field | Value |
|---|---|
| Code | V-BOM-001 |
| Severity | error |
| Meaning | A SKU with `make_buy = 'make'` has no approved BOM version |
| User Message | "SKU [part_number] is marked as Make but has no approved BOM. Create and approve a BOM before calculating." |
| Developer Guidance | Check `boms` and `bom_versions` for this `sku_id`. Status must be `approved`. |
| Suggested Fix | Create BOM and submit for approval, or change SKU to `make_buy = 'buy'` |

### V-BOM-002 — Buy SKU Has BOM

| Field | Value |
|---|---|
| Code | V-BOM-002 |
| Severity | warning |
| Meaning | A SKU with `make_buy = 'buy'` has an existing BOM (contradictory) |
| User Message | "SKU [part_number] is marked as Buy but has a BOM. Remove the BOM or change the SKU to Make." |
| Developer Guidance | Check `boms.sku_id` for this SKU. |
| Suggested Fix | Delete the BOM or update `make_buy` to `make` |

### V-BOM-003 — Empty BOM

| Field | Value |
|---|---|
| Code | V-BOM-003 |
| Severity | error |
| Meaning | An approved BOM version exists but has no lines |
| User Message | "BOM for [part_number] v[N] is empty. Add at least one component before approval." |
| Suggested Fix | Add lines to the BOM version |

### V-BOM-004 — Duplicate BOM Line

| Field | Value |
|---|---|
| Code | V-BOM-004 |
| Severity | warning |
| Meaning | The same SKU appears twice at the same level in the BOM |
| User Message | "SKU [part_number] appears twice in [parent] BOM. Consolidate into a single line." |
| Suggested Fix | Merge duplicate lines into one with combined quantity |

### V-BOM-005 — BOM Cycle

| Field | Value |
|---|---|
| Code | V-BOM-005 |
| Severity | error |
| Meaning | A cycle was detected in the BOM structure (A → B → A) |
| User Message | "Circular reference detected in BOM for [part_number]. A component cannot reference its own parent." |
| Developer Guidance | `detectBomCycle` DFS returns the cycle path. Check `parent_line_id` chain for repeated IDs. |
| Suggested Fix | Remove the circular reference from `bom_lines` |

### V-BOM-006 — Archived SKU in Active BOM

| Field | Value |
|---|---|
| Code | V-BOM-006 |
| Severity | warning |
| Meaning | An approved BOM references a SKU with `status = 'archived'` or `status = 'discontinued'` |
| User Message | "SKU [part_number] in BOM [name] is archived. Update the BOM to use an active replacement." |
| Suggested Fix | Replace the archived SKU in the BOM or reactivate the SKU |

### V-BOM-007 — Sub-assembly Make/Buy Mismatch

| Field | Value |
|---|---|
| Code | V-BOM-007 |
| Severity | warning |
| Meaning | A BOM line references a `sub_assembly` SKU that is marked `make_buy = 'buy'` |
| User Message | "Component [part_number] in BOM is a sub-assembly but is marked as Buy. Check the sourcing strategy." |
| Suggested Fix | Change sub-assembly `make_buy` to `make` or `make_or_buy` |

### V-COST-001 — No Active Cost Set

| Field | Value |
|---|---|
| Code | V-COST-001 |
| Severity | error |
| Meaning | No cost set with `status = 'active'` exists for the organization |
| User Message | "No active cost set found. Create and activate a cost set before calculating." |
| Suggested Fix | Create a cost set and set `status = 'active'` |

### V-COST-002 — Cost Set Date Overlap

| Field | Value |
|---|---|
| Code | V-COST-002 |
| Severity | warning |
| Meaning | Two active cost sets have overlapping effective date ranges |
| User Message | "Cost sets [A] and [B] have overlapping dates. The engine will use the most specific match, but review is recommended." |
| Suggested Fix | Close one cost set's `effective_to` date |

### V-SKU-001 — Inactive SKU in BOM

| Field | Value |
|---|---|
| Code | V-SKU-001 |
| Severity | error |
| Meaning | A BOM references a SKU with `status != 'active'` |
| User Message | "SKU [part_number] in BOM [name] is not active. Activate the SKU or update the BOM." |
| Suggested Fix | Activate the SKU or replace it in the BOM |

### V-SKU-002 — Subfamily/Family Mismatch

| Field | Value |
|---|---|
| Code | V-SKU-002 |
| Severity | warning |
| Meaning | A SKU's `subfamily_id` does not belong to its `family_id` |
| User Message | "SKU [part_number] subfamily does not belong to its family. Correct the classification." |
| Developer Guidance | This is an app-layer constraint (cannot be enforced as DB FK). Check `subfamilies.family_id`. |
| Suggested Fix | Update `skus.subfamily_id` or `skus.family_id` to be consistent |

### V-SKU-003 — Unqualified Supplier for Regulated SKU

| Field | Value |
|---|---|
| Code | V-SKU-003 |
| Severity | error |
| Meaning | A regulated SKU (`is_regulated = true`) uses a supplier that is not qualified (`is_qualified = false`) |
| User Message | "Supplier [name] for regulated SKU [part_number] is not qualified. Qualify the supplier or use an alternative." |
| Developer Guidance | EU MDR compliance requirement — regulated items must have qualified suppliers. |
| Suggested Fix | Set `suppliers.is_qualified = true` for the relevant supplier |

### V-SKU-004 — No Active Cost for SKU

| Field | Value |
|---|---|
| Code | V-SKU-004 |
| Severity | warning |
| Meaning | A SKU in a BOM has no cost item or supplier price in any active cost set |
| User Message | "SKU [part_number] has no cost in the selected cost set. Add a cost item or supplier price." |
| Suggested Fix | Add a `cost_items` record for this SKU, or add a supplier price |

---

## Calculation Engine Errors

### CALC-001 — Validation Blocks Calculation

| Field | Value |
|---|---|
| HTTP Status | 422 |
| Error String | `"Validation errors block calculation"` |
| Meaning | The validation engine found error-severity findings that must be resolved first |
| User Message | "Cannot calculate: [N] validation errors must be fixed. Go to Validation Center." |
| Suggested Fix | Run validation, fix all `severity = 'error'` findings, then retry |

### CALC-002 — No Approved BOM Version

| Field | Value |
|---|---|
| HTTP Status | 404 |
| Error String | `"No approved BOM version"` |
| Meaning | The BOM exists but no version has `status = 'approved'` |
| User Message | "No approved BOM version found for [part_number]. Approve a version before calculating." |
| Suggested Fix | Approve a BOM version |

### CALC-003 — BOM Cycle

| Field | Value |
|---|---|
| HTTP Status | 422 |
| Error String | contains `"cycle"` |
| Meaning | Cycle detected at calculation time (also caught in validation) |
| Suggested Fix | Fix BOM cycle (see V-BOM-005) |

### CALC-004 — Missing Cost (Non-blocking)

| Field | Value |
|---|---|
| HTTP Status | 200 (success) |
| Indicator | `calculation_trace_lines.has_missing_cost = true` |
| Meaning | A BOM component had no resolvable cost — cost treated as 0 |
| User Message | "Warning: [part_number] has no cost. Total may be understated." |
| Suggested Fix | Add cost item or supplier price for the SKU |

### CALC-005 — Trace Persistence Failure

| Field | Value |
|---|---|
| HTTP Status | 500 |
| Meaning | The calculation succeeded but writing to `calculation_traces` failed |
| User Message | "Calculation result could not be saved. Please retry." |
| Developer Guidance | Check Supabase logs for INSERT errors on `calculation_traces`. Check RLS — trace tables are service-role writes. |

---

## API Errors

| HTTP Status | Error Code | Meaning | User Message |
|---|---|---|---|
| 400 | `invalid_json` | Request body is not valid JSON | "Request body must be valid JSON" |
| 400 | `validation_failed` | Zod schema validation failed | "Validation failed" + `details` with field errors |
| 401 | `unauthorized` | No authenticated session | "Unauthorized" — redirect to /login |
| 403 | `forbidden` | Session exists but insufficient role | "Forbidden — insufficient permissions" |
| 404 | `not_found` | Resource not found (wrong ID) | "Not found" |
| 409 | `conflict` | Unique constraint violation | "Conflict — [resource] already exists" |
| 422 | `unprocessable` | Business logic violation | Specific message from cost/validation engine |
| 500 | `internal_error` | Unexpected server error | "Internal error — [endpoint name] failed" |

---

## Auth Errors

### Missing Session

| Situation | Behavior |
|---|---|
| User not logged in | Middleware redirects to `/login` |
| API call without session cookie | Returns `{ error: 'Unauthorized' }` (401) |
| Session expired | Supabase client returns null user; API returns 401; middleware redirects |

### Missing Profile

| Situation | Behavior |
|---|---|
| `auth.users` row exists but `profiles` row missing | `GET /api/auth/me` returns `{ user: { id, email, full_name: null, role: null, organization_id: null } }` |
| Missing profile makes all RLS policies fail | User sees empty lists everywhere — no error shown |
| Fix | Create `profiles` row via service-role INSERT with correct `organization_id` |

### Organization Mismatch

| Situation | Behavior |
|---|---|
| `profiles.organization_id` does not match any `organizations.id` | `auth_org_id()` returns null; all RLS policies deny access |
| User from org A accessing org B data | RLS silently returns empty (no 403 — just empty results) |
| Fix | Ensure `profiles.organization_id` matches the organization the user should access |

---

## Error Handling Rules

1. **Never expose raw DB error messages** — always translate to user-friendly messages
2. **Always return JSON** — even for 500 errors: `{ "error": "descriptive message" }`
3. **Always include `details` for 400** — Zod `flatten()` output makes field-level errors parseable
4. **Log server errors** — use `console.error` or logger before returning 500
5. **Never return 200 for errors** — use correct HTTP status codes
6. **401 vs 403** — 401 = no session; 403 = has session but wrong role/org
