# Test Strategy

**Date:** 2026-06-18  
**Framework:** Vitest (unit + integration), Playwright (E2E)  
**Test database:** Local Supabase Docker instance (same migrations, isolated schema)

---

## 1. Unit Test Matrix

### 1A — Cost Engine Unit Tests (`tests/unit/costEngine/`)

| Test | Input | Expected Output |
|------|-------|----------------|
| SKU-specific cost wins over all others | cost_set with all 6 scope types | returns Priority 1 cost item |
| Subfamily cost wins when no SKU-specific | cost_set without sku scope | returns Priority 2 cost item |
| Family cost wins when no subfamily | cost_set without subfamily scope | returns Priority 3 cost item |
| Supplier+Country wins when no family | cost_set with supplier_country only | returns Priority 4 cost item |
| Global wins as fallback | cost_set with only global | returns Priority 5 cost item |
| Supplier price used as last resort | only supplier_price exists | returns Priority 6, WARNING in trace |
| No cost found → warning, no crash | empty cost_set | returns null + WARNING finding |
| Manual adjustment overrides Priority 1 | manual_adj + sku-specific cost_item | manual_adj wins (Priority 0) |
| Approved manual_adj only | pending manual_adj | pending adj ignored |
| Roll-up: leaf × qty | 3-level BOM, qty=2 each | total = leaf_cost × 2 × 2 × 2 |
| Roll-up: multiple children | 1 parent, 3 children, different costs | parent = Σ(child × qty) |
| Roll-up: virtual component fixed | virtual_component, cost_type=fixed | adds fixed value to parent |
| Roll-up: virtual component percentage | virtual_component, cost_type=pct_of_material | adds % of material total |
| Active rule modifies cost | rule with condition sku.item_type='purchased_part', action add_percentage=10% | cost + 10% |
| Rule with exception suppresses rule | rule + active exception for sku | rule not applied |
| Overhead % applied to total | cost_set global overhead_pct=15 | total × 1.15 |
| Labor rate applied | cost_set labor_rate=50/hr, bom has labor virtual | adds 50 × qty_hours |

### 1B — Validation Engine Unit Tests (`tests/unit/validationEngine/`)

| Test | Input | Expected Finding |
|------|-------|-----------------|
| V-BOM-001: empty BOM | bom with 0 lines | ERROR V-BOM-001 |
| V-BOM-002: inactive SKU in BOM | bom_line → discontinued SKU | ERROR V-BOM-002 |
| V-BOM-003: duplicate child SKU | two lines with same sku_id at same parent | WARNING V-BOM-003 |
| V-BOM-004: qty = 0 | bom_line.quantity = 0 | ERROR V-BOM-004 |
| V-BOM-005: cycle detection (direct) | A → B → A | ERROR V-BOM-005 |
| V-BOM-005: cycle detection (indirect) | A → B → C → A | ERROR V-BOM-005 |
| V-BOM-005: no cycle | valid 3-level BOM | no V-BOM-005 |
| V-BOM-006: archived SKU | bom_line → archived SKU | WARNING V-BOM-006 |
| V-SKU-002: wrong family for subfamily | sku.family_id != subfamily.family_id | ERROR V-SKU-002 |
| V-COST-001: currency mismatch | cost_item.currency != cost_set.base_currency | ERROR V-COST-001 |
| V-COST-003: scrap rate > 100% | cost_item.value = 1.5 for scrap_rate | ERROR V-COST-003 |
| V-INV-004: ERROR findings block approval | validation_run with ERROR finding | blocks approval |
| Auto-resolve (OQ-07) | second run, issue fixed | previous finding → 'resolved' |

### 1C — BOM Cycle Detection Unit Tests (`tests/unit/cycle/`)

| Test | Input | Expected |
|------|-------|----------|
| No cycle, single level | [A→B, A→C] | false |
| No cycle, 3 levels | [A→B, B→C, B→D] | false |
| Direct cycle | [A→B, B→A] | true |
| Indirect cycle (length 3) | [A→B, B→C, C→A] | true |
| Indirect cycle (length 5) | [A→B→C→D→E→A] | true |
| Same SKU at different parents, no cycle | [A→B, A→C, C→B] (diamond, no cycle) | false |
| Diamond with cycle | [A→B, A→C, B→D, C→D, D→A] | true |

### 1D — Cost Precedence Unit Tests (`tests/unit/precedence/`)

| Test | Expected Priority Used |
|------|----------------------|
| All 6 levels populated | 1 (SKU-specific) |
| Levels 2–6 populated | 2 (Subfamily) |
| Levels 3–6 populated | 3 (Family) |
| Levels 4–6 populated | 4 (Supplier+Country) |
| Levels 5–6 populated | 5 (Global) |
| Only level 6 | 6 (Supplier price) |
| Nothing populated | null + WARNING |
| Manual adj + level 1 | 0 (manual_adjustment) |
| Manual adj (pending) + level 1 | 1 (manual adj not active, ignored) |

---

## 2. Integration Test Matrix

All integration tests run against the local Supabase Docker instance with test migrations applied.

### 2A — Repository Integration Tests (`tests/integration/repositories/`)

| Test | Validates |
|------|-----------|
| skuRepository.create + findById | Insert + RLS SELECT |
| skuRepository.create as viewer → expect 403 | RLS INSERT blocks viewer |
| skuRepository.archive → V-SKU-004 fired | Pre-archive validation |
| bomLineRepository.create → cycle check | Cycle detection at write time (ADR-106) |
| bomVersionRepository.approve → partial unique index | C-02 enforced |
| costSetRepository.lock → cost_items blocked | is_locked RLS check |
| auditLogRepository.findByOrg as viewer → empty | RLS SELECT blocks viewer |
| auditLogRepository.findByOrg as approver → data | RLS SELECT allows approver |

### 2B — API Integration Tests (`tests/integration/api/`)

| Test | Method | Path | Expected |
|------|--------|------|----------|
| Unauthenticated request | GET | `/api/skus` | 401 |
| Viewer reads SKUs | GET | `/api/skus` | 200 + data |
| Viewer creates SKU | POST | `/api/skus` | 403 |
| Editor creates SKU | POST | `/api/skus` | 201 |
| Admin creates SKU | POST | `/api/skus` | 201 |
| Zod validation: missing part_number | POST | `/api/skus` | 400 + error detail |
| Cost engine: valid BOM + cost_set | POST | `/api/calculate` | 200 + trace_id |
| Cost engine: BOM with cycle | POST | `/api/calculate` | 422 + V-BOM-005 |
| Cost engine: no cost for leaf SKU | POST | `/api/calculate` | 200 + warnings |
| Snapshot valuation: 0-line snapshot | POST | `/api/inventory/snapshots/[id]/value` | 422 |
| Snapshot approval with ERROR findings | POST | `/api/inventory/snapshots/[id]/approve` | 422 |

### 2C — RLS Integration Tests (`tests/integration/rls/`)

| Test | User | Table | Operation | Expected |
|------|------|-------|-----------|----------|
| Org isolation: user from org A cannot see org B | org_b_user | skus | SELECT | 0 rows |
| Org isolation: user from org A cannot create in org B | org_b_user | skus | INSERT | 403 |
| Locked cost_set blocks new cost_items | editor | cost_items | INSERT | 403 |
| Unlocked BOM version allows bom_lines edit | editor | bom_lines | INSERT | 201 |
| Approved BOM version blocks bom_lines edit | editor | bom_lines | INSERT | 403 |
| audit_log: no INSERT from application | admin | audit_log | INSERT | 403 |
| audit_log: no UPDATE from application | admin | audit_log | UPDATE | 403 |
| audit_log: no DELETE from application | admin | audit_log | DELETE | 403 |

---

## 3. Business Validation Matrix

End-to-end scenarios that validate the full business logic chain.

| Scenario | Steps | Pass Criteria |
|----------|-------|--------------|
| **BOM01:** Simple 2-level BOM costing | Create SKU A (parent), SKU B (child). BOM: A contains 3× B. Cost B = 10. | Cost A = 30. trace shows priority=2 (SKU-specific). |
| **BOM02:** 3-level BOM with manual override | A→B→C. Cost C=5, B rolls up, A gets overhead 10%. Manual adj on B = 50. | B cost = 50 (not roll-up). A = 50×qty + overhead. |
| **BOM03:** Virtual component percentage | A contains B + VC (5% of material). Cost B=100. | A = 100 + 5 = 105. VC trace shows pct_of_material. |
| **RULE01:** Cost rule adds 10% for purchased parts | Rule: if sku.item_type=purchased_part → add 10%. Cost B=100. | B = 110. rule_execution_trace.was_applied=true. |
| **RULE02:** Exception suppresses rule for specific SKU | Same rule + exception for SKU C. | B=110, C=original cost. exception_execution_trace shows rule suppressed. |
| **INV01:** Inventory valuation with frozen cost | Approve snapshot. Change cost_set. Read snapshot. | Snapshot unit_costs unchanged. cost_set_snapshot reflects old values. |
| **INV02:** Inventory valuation total consistency | 10 inventory lines. Sum(unit_cost × qty) must equal valuation_result.total_value WHERE group_type='all'. | Totals match. |
| **AUDIT01:** Trigger captures edit | Edit SKU part_description. | audit_log has row: table_name=skus, event_type=data_update, change_delta={description}. |
| **AUDIT02:** Trigger captures delete | Delete bom_line. | audit_log has row: event_type=data_delete, old_values has full row. |

---

## 4. BOM Recursion Tests

| Test | BOM Depth | Lines per Level | Expected Time |
|------|-----------|----------------|---------------|
| Shallow BOM | 2 levels | 5 children | < 50ms |
| Medium BOM | 4 levels | 10 children each | < 200ms |
| Complex BOM | 5 levels | 20 children each | < 500ms |
| Large BOM (500 components) | 5 levels | varied | < 2000ms (NFR) |
| Very wide BOM (flat) | 1 level | 200 children | < 300ms |

---

## 5. Circular BOM Tests

These tests verify that the write-time cycle detector (ADR-106) prevents circular BOM structures.

| Scenario | How to Trigger | Expected |
|----------|--------------|----------|
| Direct cycle (2-node) | Add BOM line: A→B, then B→A | REJECT with V-BOM-005 |
| Direct cycle (3-node) | A→B→C, then C→A | REJECT with V-BOM-005 |
| Long chain cycle (10-node) | A→B→...→J, then J→A | REJECT with V-BOM-005 |
| Diamond (no cycle) | A→B, A→C, B→D, C→D | ACCEPT (valid) |
| Self-reference | Add line: A→A | REJECT with V-BOM-005 |
| Cross-BOM (no cycle — each BOM independent) | BOM-1: A→B. BOM-2: B→A | ACCEPT (different BOMs) |

---

## 6. Cost Rule Tests

| Test | Rule Setup | Input | Expected |
|------|-----------|-------|----------|
| Condition: item_type match | if item_type='purchased_part' → add 5% | purchased_part SKU | +5% |
| Condition: item_type no match | if item_type='purchased_part' → add 5% | sub_assembly SKU | unchanged |
| Condition: family match | if family_id=F1 → add 10% | SKU in F1 | +10% |
| Condition: supplier_country match | if country='CN' → add 3% (duty) | SKU from CN supplier | +3% |
| Multiple conditions AND | item_type=purchased_part AND country=CN | purchased_part from CN | both conditions required |
| Multiple rules by priority | rule P=1 add 5%, rule P=2 add 3% | both apply | P=1 first, P=2 second (cumulative) |
| Inactive rule not applied | rule.is_active=false | SKU matches condition | rule skipped |
| Rule exception suppresses rule | active exception for SKU X | SKU X with matching rule | rule suppressed for X |
| Expired exception not applied | exception status='expired' | SKU X | rule applied normally |

---

## 7. Inventory Valuation Tests

| Test | Setup | Expected |
|------|-------|----------|
| Valuation writes unit_cost | 5-line snapshot, cost_set with costs | all 5 lines have unit_cost set |
| unit_cost = trace total | compare inventory_line.unit_cost to calc_trace.total_unit_cost | equal |
| Approval freezes cost_set_snapshot | approve, then modify cost_set items | snapshot.cost_set_snapshot unchanged |
| Re-read historical snapshot | read approved snapshot 1 week later | unit_costs identical to approval time |
| Valuation result totals | sum of (unit_cost × quantity) | equals inventory_valuation_results.total_value WHERE group_type='all' |
| Per-warehouse result | 2 warehouses in snapshot | 2 rows in inventory_valuation_results WHERE group_type='warehouse' |
| Per-family result | SKUs across 3 families | 3 rows WHERE group_type='family' |
| ERROR finding blocks approval | validation_finding with severity='error' in pre-approval run | approval rejected |

---

## 8. Test File Structure

```
tests/
  unit/
    costEngine/
      precedence.test.ts
      rollup.test.ts
      manualAdjustments.test.ts
      virtualComponents.test.ts
      ruleEngine.test.ts
    validationEngine/
      bom.test.ts
      sku.test.ts
      cost.test.ts
      rule.test.ts
      inventory.test.ts
      autoResolve.test.ts
    cycle/
      detector.test.ts
  integration/
    repositories/
      skuRepository.test.ts
      bomRepository.test.ts
      costEngine.integration.test.ts
    api/
      calculate.test.ts
      inventory.test.ts
    rls/
      orgIsolation.test.ts
      roleAccess.test.ts
      auditLog.test.ts
  e2e/                    (Playwright)
    bom-management.spec.ts
    costing-flow.spec.ts
    inventory-valuation.spec.ts
    audit-log.spec.ts
  fixtures/
    testOrg.ts
    testBom.ts
    testCostSet.ts
    testInventory.ts
  setup/
    globalSetup.ts        — start Supabase local, run migrations
    globalTeardown.ts     — stop Supabase local
```
