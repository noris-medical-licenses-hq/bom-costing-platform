# Backend Implementation Plan

**Date:** 2026-06-18  
**Author:** Autonomous Delivery Mode  
**Scope:** Full backend implementation from database provisioning to production-ready API

---

## A. Database Deployment

**Goal:** Supabase dev instance with all 23 migrations applied and TypeScript types generated.

**Deliverables:**
- [ ] Supabase project created (dev environment)
- [ ] `supabase init` — initialize Supabase CLI config
- [ ] `supabase start` — verify Docker local instance boots
- [ ] `supabase db push` — apply all 23 migrations
- [ ] Verify: `supabase db diff` returns no pending changes
- [ ] `supabase gen types typescript --local > frontend/types/supabase.ts`
- [ ] Verify auth helper functions exist: `SELECT auth_org_id(), auth_user_role()`
- [ ] Verify RLS enabled: `SELECT tablename FROM pg_tables WHERE schemaname='public'` + check `relrowsecurity`
- [ ] Seed: create one test organization row (manually, service role)
- [ ] Seed: create one test profile row linked to a test auth.users entry

**Risks:**
- `auth.users` schema must be present before M-003 runs. Supabase initializes auth schema on first `supabase start`.
- SECURITY DEFINER functions require superuser role at creation time — Supabase CLI handles this correctly.

**Dependencies:** Docker Desktop running, Supabase CLI installed (`npm install -g supabase`)

**Acceptance Criteria:**
- `supabase db push` exits 0 with no errors
- All 32 tables visible in Supabase Studio Table Editor
- RLS toggle shows enabled for all tables
- auth helper functions callable from SQL editor
- TypeScript types file generated without errors

---

## B. Repository Layer (`backend/repositories/`)

**Goal:** One typed repository per domain entity, wrapping Supabase client queries with Zod output validation.

**Pattern:**
```typescript
// backend/repositories/skuRepository.ts
export async function findSkuById(id: string, client: SupabaseClient): Promise<Sku | null> {
  const { data, error } = await client.from('skus').select('*').eq('id', id).single()
  if (error) throw new DbError(error)
  return data ? SkuSchema.parse(data) : null
}
```

**Deliverables (in dependency order):**

| Repository | Key Methods |
|-----------|-------------|
| `organizationRepository` | findById, updateDefaultCostSet |
| `profileRepository` | findByUserId, findByOrg, updateLastSeen |
| `familyRepository` | list, create, update, archive |
| `subfamilyRepository` | listByFamily, create, update |
| `supplierRepository` | list, create, update, setStatus |
| `skuRepository` | list, findById, create, update, archive, checkReferences |
| `supplierPriceRepository` | listBySku, currentPrice, create, update |
| `virtualComponentRepository` | list, findById, create, update |
| `costSetRepository` | list, findActive, findById, create, lock, setDefault |
| `costItemRepository` | listByCostSet, resolveForSku (6-level precedence), create, update |
| `bomRepository` | list, findBySku, create |
| `bomVersionRepository` | listByBom, findApproved, create, approve, lock |
| `bomLineRepository` | listByVersion, create, update, delete, checkCycle |
| `manualAdjustmentRepository` | listByBomVersion, listActiveBySku, create, approve, revoke |
| `costRuleRepository` | listActive, findById, create, activate, deactivate |
| `ruleExceptionRepository` | listActive, findForSku, create, approve, expire |
| `inventorySnapshotRepository` | list, findById, create, approve |
| `inventoryLineRepository` | listBySnapshot, create, bulkCreate, updateCostTrace |
| `calculationTraceRepository` | findById, createWithLines, findForSku |
| `validationRunRepository` | create, complete, findLatestForEntity |
| `validationFindingRepository` | listByRun, createBatch, autoResolve |
| `auditLogRepository` | listByOrg, listByTable, listByUser (read-only) |

**Risks:**
- Repository must use the **user's Supabase client** (anon key + JWT), not service_role, so RLS applies.
- Service-role client used only in: background jobs, Supabase Auth hooks (profile creation).

**Dependencies:** A (Database Deployment), TypeScript types from `supabase gen types`

**Acceptance Criteria:**
- Each repository method returns typed, Zod-validated data.
- No raw SQL — all queries via Supabase client.
- Repository unit tests pass with test database.

---

## C. Cost Engine (`backend/services/costEngine/`)

**Goal:** 10-stage cost calculation pipeline as described in BLUEPRINT §5.

**Architecture:**
```
backend/services/costEngine/
  index.ts              — orchestrates 10 stages, writes trace
  stages/
    01_loadBom.ts
    02_validate.ts
    03_resolveManualAdj.ts
    04_resolveCostItems.ts  — 6-level precedence
    05_applyRules.ts
    06_processExceptions.ts
    07_rollUp.ts
    08_applyOverheadLabor.ts
    09_writeTrace.ts
    10_buildResult.ts
  precedence.ts         — 6-level cost hierarchy logic
  cycle.ts              — BOM cycle detection (ADR-106)
  types.ts              — CostResult, TraceEntry, etc.
```

**Stage Detail:**

| Stage | Input | Output | Key Logic |
|-------|-------|--------|-----------|
| 01_loadBom | bom_id, cost_set_id | BOM tree (adjacency list) | find approved bom_version; load all bom_lines ordered by depth |
| 02_validate | BOM tree | ValidationResult | call Validation Engine; abort if any ERROR severity finding |
| 03_resolveManualAdj | BOM tree | Map<sku_id, ManualAdj> | query manual_cost_adjustments WHERE sku_id IN bom_skus AND status='approved' AND bom_version matches |
| 04_resolveCostItems | BOM tree, cost_set_id | Map<sku_id, CostItem> | 6-level lookup (OQ-04: skip if manual_adj exists for sku) |
| 05_applyRules | cost_map, BOM tree | cost_map (modified) | load active cost_rules by priority; evaluate conditions; apply actions |
| 06_processExceptions | cost_map, BOM tree | cost_map (modified) | check rule_exceptions for each sku; suppress or override rule action |
| 07_rollUp | cost_map, BOM tree | rolled_cost_map | bottom-up traversal: parent = Σ(child.rolled_cost × qty) |
| 08_applyOverheadLabor | rolled_cost_map, cost_set | total_cost_map | apply overhead_pct, labor_rate from global/family cost_set_items |
| 09_writeTrace | cost_map, all stage data | trace_id | write calculation_traces + 4 sub-tables atomically |
| 10_buildResult | total_cost_map, trace_id | CostResult | { total, per_line_breakdown, warnings, trace_id } |

**6-Level Cost Precedence (Stage 04):**
```typescript
function resolveCostItem(sku: Sku, costSetId: string): CostItem | null {
  return (
    findByCostSet(costSetId, 'sku', sku.id) ||          // Priority 1: SKU-specific
    findByCostSet(costSetId, 'subfamily', sku.subfamily_id) || // Priority 2: Subfamily
    findByCostSet(costSetId, 'family', sku.family_id) ||  // Priority 3: Family
    findByCostSet(costSetId, 'supplier_country', ...) ||  // Priority 4: Supplier+Country
    findByCostSet(costSetId, 'global') ||                 // Priority 5: Global
    findActiveSupplierPrice(sku.id) ||                    // Priority 6: Supplier price
    null  // → Warning: no cost found
  )
}
```

**Risks:**
- Cycle detection (ADR-106) must run at BOM write time AND at cost engine time (belt-and-suspenders).
- Stage 09 (writeTrace) must be transactional — partial trace writes create inconsistent explainability.
- Performance: 500-component BOM roll-up must complete in < 2s. Use batched DB reads per level, not per-row.

**Dependencies:** B (Repository Layer), D (Validation Engine)

**Acceptance Criteria:**
- Cost roll-up for a 3-level, 20-line BOM produces correct totals.
- Each `cost_source_traces` row accurately records which precedence level was used and which were skipped.
- Manual adjustment (Priority 0) correctly overrides all cost_set_items for the same sku.
- Engine aborts on ERROR-severity validation findings.
- Trace is written in a single DB transaction.

---

## D. Validation Engine (`backend/services/validationEngine/`)

**Goal:** Validate BOM, SKU, cost, and rule data against all rules in DATA_MODEL §9 (V-BOM-001 through V-INV-004).

**Architecture:**
```
backend/services/validationEngine/
  index.ts            — run validation suite, write validation_run + findings
  rules/
    bom/              — V-BOM-001 through V-BOM-007
    sku/              — V-SKU-001 through V-SKU-004
    cost/             — V-COST-001 through V-COST-009
    rule/             — V-RULE-001 through V-RULE-004
    inventory/        — V-INV-001 through V-INV-004
  autoResolve.ts      — mark old findings resolved when re-run finds them fixed (OQ-07)
  types.ts            — ValidationFinding, ValidationRun, etc.
```

**Key Validation Rules:**

| Code | Category | Description | Severity |
|------|---------|-------------|----------|
| V-BOM-001 | BOM | BOM must have at least one line | ERROR |
| V-BOM-002 | BOM | All bom_lines reference existing, active SKUs | ERROR |
| V-BOM-003 | BOM | Duplicate child SKU at same parent level | WARNING |
| V-BOM-004 | BOM | bom_line.quantity must be > 0 | ERROR |
| V-BOM-005 | BOM | BOM must not contain cycles (ADR-106) | ERROR |
| V-BOM-006 | BOM | Archived SKU referenced in BOM | WARNING |
| V-BOM-007 | BOM | Sub-assembly SKU must have make_buy in (make, make_or_buy) | WARNING |
| V-SKU-001 | SKU | part_number must be unique within org | ERROR |
| V-SKU-002 | SKU | Subfamily must belong to specified Family | ERROR |
| V-SKU-003 | SKU | Discontinued SKU is parent in active BOM | WARNING |
| V-SKU-004 | SKU | No active cost found in active cost_set | WARNING |
| V-COST-001 | Cost | cost_items.currency must match cost_sets.base_currency | ERROR |
| V-COST-002 | Cost | effective_date overlap for same scope in same cost_set | WARNING |
| V-COST-003 | Cost | Scrap rate between 0% and 100% | ERROR |
| V-COST-004 | Cost | Global overhead_pct must exist in active cost_set | WARNING |
| V-COST-005 | Cost | supplier_price exists but no cost_set_item — only supplier_price used | INFO |
| V-RULE-001 | Rule | Rule condition references a field that does not exist on SKU | ERROR |
| V-RULE-002 | Rule | Rule action value is outside valid range | ERROR |
| V-RULE-003 | Rule | Active rule has no conditions | WARNING |
| V-RULE-004 | Rule | Rule exception expired but status not updated | WARNING |
| V-INV-001 | Inventory | Inventory line SKU not in approved BOM version | WARNING |
| V-INV-002 | Inventory | No cost found for inventory line SKU | ERROR |
| V-INV-003 | Inventory | Snapshot valuation total is zero | WARNING |
| V-INV-004 | Inventory | Snapshot approved with open ERROR findings | ERROR (block) |

**Dependencies:** B (Repository Layer)

**Acceptance Criteria:**
- Running validation on a BOM with a cycle produces exactly one V-BOM-005 ERROR finding.
- Running validation twice on a fixed BOM auto-resolves prior findings (OQ-07).
- Validation run completes in < 500ms for a 50-line BOM.

---

## E. API Layer (`app/api/` and server actions)

**Goal:** Type-safe, RLS-respecting API surface for all UI operations.

**Endpoints (organized by domain):**

| Domain | Method | Path | Action |
|--------|--------|------|--------|
| SKUs | GET | `/api/skus` | list with filters |
| SKUs | POST | `/api/skus` | create |
| SKUs | PATCH | `/api/skus/[id]` | update |
| SKUs | POST | `/api/skus/[id]/archive` | archive with pre-check |
| BOMs | GET | `/api/boms` | list |
| BOMs | POST | `/api/boms` | create |
| BOM Versions | GET | `/api/bom-versions/[id]` | get with lines |
| BOM Versions | POST | `/api/bom-versions/[id]/approve` | approve workflow |
| BOM Lines | POST | `/api/bom-lines` | add line (triggers cycle check) |
| BOM Lines | DELETE | `/api/bom-lines/[id]` | remove line |
| Cost Sets | GET | `/api/cost-sets` | list |
| Cost Sets | POST | `/api/cost-sets` | create |
| Cost Sets | POST | `/api/cost-sets/[id]/lock` | lock |
| Cost Items | GET | `/api/cost-sets/[id]/items` | list by cost_set |
| Cost Items | POST | `/api/cost-sets/[id]/items` | create |
| Costing | POST | `/api/calculate` | run cost engine (bom_id, cost_set_id) |
| Traces | GET | `/api/traces/[id]` | get full trace with all sub-tables |
| Validation | POST | `/api/validate` | run validation engine |
| Validation | GET | `/api/validate/findings/[entityType]/[entityId]` | get findings |
| Inventory | POST | `/api/inventory/snapshots` | create snapshot |
| Inventory | POST | `/api/inventory/snapshots/[id]/value` | run valuation |
| Inventory | POST | `/api/inventory/snapshots/[id]/approve` | approve snapshot |
| Audit | GET | `/api/audit` | list audit log (admin/approver only) |
| Export | GET | `/api/export/cost/[traceId]` | CSV export |

**Server Action pattern:**
```typescript
// app/actions/calculateCost.ts
'use server'
export async function calculateCost(bomId: string, costSetId: string) {
  const client = createServerSupabaseClient()  // uses user JWT
  const validated = CalculateInputSchema.parse({ bomId, costSetId })
  return costEngine.run(validated.bomId, validated.costSetId, client)
}
```

**Risks:**
- Every server action must use the user's JWT client (not service_role) so RLS applies.
- Cost engine and validation engine are the only exceptions — they read system-wide data but always filter by `auth_org_id()`.

**Dependencies:** B, C, D

**Acceptance Criteria:**
- POST `/api/calculate` returns `{ total, trace_id, warnings }` in < 2s for 500-component BOM.
- All endpoints return 401 if no valid JWT.
- All endpoints return 403 if role insufficient (test with viewer JWT on cost_analyst route).
- Zod validation returns 400 with structured error on invalid input.

---

## F. Audit Center (`app/(dashboard)/audit/`)

**Goal:** Read-only audit log viewer for admin and approver roles.

**Features:**
- Filter by: table, user, date range, event type
- Show: old_values / new_values diff (colored JSON)
- Pagination (cursor-based, ordered by performed_at DESC)
- CSV export

**Risks:** Audit log can grow very large. Use cursor-based pagination, never offset pagination.

**Dependencies:** B (auditLogRepository), E (API layer)

**Acceptance Criteria:**
- Viewer role cannot access audit UI (redirect to 403 page).
- Admin can see all org events.
- Approver can see all org events.
- Diff view correctly highlights which fields changed.

---

## G. Inventory Valuation (`backend/services/inventoryValuation/`)

**Goal:** Given an inventory snapshot, value every line using the cost engine output and freeze the result.

**Flow:**
```
POST /api/inventory/snapshots/[id]/value
  │
  ├── Load all inventory_lines for snapshot
  ├── For each unique sku_id:
  │     Run cost engine (bom_id of sku's approved BOM, cost_set_id from snapshot)
  │     Write calculation_trace
  │     Write inventory_lines.unit_cost = trace.total_unit_cost
  │     Write inventory_lines.cost_trace_id = trace.id
  ├── Write inventory_valuation_results (by warehouse, family, subfamily, all)
  └── Mark snapshot.status = 'valued'
  │
POST /api/inventory/snapshots/[id]/approve
  ├── Freeze cost_set_snapshot JSONB (snapshot of entire cost_set at this moment)
  ├── Run pre-approval validation (V-INV-004: no ERROR findings allowed)
  └── Mark snapshot.status = 'approved'
```

**Risks:**
- Large snapshots (1000+ lines) must process SKUs in parallel batches, not serially.
- cost_set_snapshot JSONB must be written atomically with the approval transaction.

**Dependencies:** B, C, D (all engines)

**Acceptance Criteria:**
- Approved snapshot can be fully reconstructed from stored `cost_set_snapshot` + `inventory_lines.unit_cost` without querying current cost_set_items.
- Valuation results match manual calculation for a 10-line test snapshot.
