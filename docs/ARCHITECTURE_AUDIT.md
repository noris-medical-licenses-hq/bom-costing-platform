# Architecture Audit Report

**Date:** 2026-06-18  
**Scope:** Full cross-document review — entity, relationship, constraint, naming, auditability, explainability, MVP scope  
**Status:** PASS with fixes applied

---

## 1. Audit Methodology

Compared DATA_MODEL.md (v2.0, authoritative schema), BLUEPRINT.md (v1.0, business logic SoT), ARCHITECTURE.md, PROJECT_SPECIFICATION.md, DECISIONS.md, ROADMAP.md, and all 23 migration files.

---

## 2. Entity Consistency

| Check | Result | Notes |
|-------|--------|-------|
| Table count: DATA_MODEL vs migrations | ✅ PASS | 32 tables in both |
| Table names: DATA_MODEL vs migrations | ✅ PASS | All match post-fix |
| Table names: BLUEPRINT vs DATA_MODEL | ✅ PASS | Fixed (sub_families → subfamilies) |
| Table names: ARCHITECTURE vs DATA_MODEL | ✅ PASS | Fixed (audit_events → audit_log) |
| Column names: DATA_MODEL vs migrations | ✅ PASS | All critical columns verified |
| Unified SKU model (ADR-101) | ✅ PASS | Single `skus` table, no products/components |
| Cost Sets (ADR-102) | ✅ PASS | `cost_sets` table, no `cost_scenarios` |

---

## 3. Relationship Consistency

| FK / Relationship | Defined In | Status |
|------------------|-----------|--------|
| profiles → auth.users | M-003 | ✅ ON DELETE CASCADE |
| profiles → organizations | M-003 | ✅ |
| subfamilies → families | M-004 | ✅ |
| skus → families, subfamilies | M-006 | ✅ nullable both |
| skus → suppliers (default) | M-006 | ✅ nullable |
| supplier_prices → skus, suppliers, profiles | M-007 | ✅ |
| boms → skus | M-015 | ✅ UNIQUE (C-17) |
| bom_versions → boms, profiles | M-015 | ✅ |
| bom_lines → bom_versions (bom_version_id) | M-015 | ✅ |
| bom_lines → bom_lines (parent_line_id) | M-015 | ✅ self-ref nullable |
| bom_lines → skus OR virtual_components (CHECK C-03) | M-015 | ✅ exactly one required |
| cost_items → cost_sets | M-011 | ✅ |
| cost_items → scope (polymorphic) | M-011 | ⚠️ app-layer (no DB FK — documented) |
| rule_exceptions → exception scope (polymorphic) | M-012 | ⚠️ app-layer (no DB FK — documented) |
| inventory_lines → inventory_snapshots | M-016 | ✅ |
| inventory_lines → skus | M-016 | ✅ |
| inventory_lines → warehouses | M-016 | ✅ nullable |
| organizations.default_cost_set_id → cost_sets | M-010 | ✅ deferred FK, correctly resolved |
| manual_cost_adjustments.bom_version_id → bom_versions | M-015 | ✅ deferred FK, correctly resolved |
| inventory_lines.cost_trace_id → calculation_traces | M-020 | ✅ deferred FK, correctly resolved |

**Two known polymorphic FKs without DB constraint:** documented in DECISIONS.md, enforced at application layer.

---

## 4. Constraint Consistency

| Constraint | Code | Where | Status |
|-----------|------|-------|--------|
| One BOM per SKU | C-17 | M-015 UNIQUE(sku_id) on boms | ✅ |
| One approved version per BOM | C-02 | M-015 partial unique index WHERE status='approved' | ✅ |
| Exactly one of sku_id/virtual_component_id per bom_line | C-03 | M-015 CHECK | ✅ |
| quantity > 0 on bom_lines | C-01 | M-015 CHECK | ✅ |
| quantity > 0 on inventory_lines | C-01 | M-016 CHECK | ✅ |
| Unique (snapshot_id, sku_id, warehouse_id) on inventory_lines | C-18 | M-016 UNIQUE | ✅ |
| rule_exceptions.business_justification non-empty | C-09 | M-012 CHECK | ✅ |
| manual_cost_adjustments.reason non-empty | C-19 | M-013 CHECK | ✅ |
| cost_rules.description non-empty | C-20 | M-012 CHECK | ✅ |
| Supplier price effective_to > effective_from | — | M-007 CHECK | ✅ |
| unit_price > 0 on supplier_prices | — | M-007 CHECK | ✅ |
| country = 2-char ISO code | — | M-005, M-009 CHECK | ✅ |
| currency = 3-char ISO code | — | M-007 CHECK | ✅ |
| profiles role value | — | M-003 CHECK | ✅ 6 valid values |
| cost_source_priority BETWEEN 1 AND 6 (or NULL) | — | M-017 CHECK | ✅ NULL for manual_adj |

---

## 5. Naming Consistency

| Item | Before Audit | After Fix | Status |
|------|-------------|-----------|--------|
| Table: `subfamilies` | BLUEPRINT used `sub_families` | Fixed | ✅ |
| Column: `subfamily_id` | BLUEPRINT used `sub_family_id` | Fixed | ✅ |
| scope_type value `subfamily` | BLUEPRINT used `sub_family` | Fixed | ✅ |
| `audit_log` table | BLUEPRINT used `audit_events` | Fixed | ✅ |
| `cost_set_id` in API | ARCHITECTURE used `scenario_id` | Fixed | ✅ |
| Audit trigger coverage (23 tables) | BLUEPRINT listed 20 | Fixed | ✅ |
| PROJECT_SPECIFICATION roles | Listed 4, had 6 | Fixed | ✅ |
| Data flow PDF export | Listed PDF, only CSV in MVP | Fixed | ✅ |

---

## 6. Auditability Requirements

| Requirement | Implementation | Status |
|-------------|---------------|--------|
| All mutations logged | DB trigger M-022 on 23 tables | ✅ |
| Audit failure never blocks operation | EXCEPTION WHEN OTHERS guard | ✅ |
| Trigger uses auth.uid() | Lines 69, via auth.uid() | ✅ |
| audit_log has no trigger (prevent recursion) | Explicitly excluded | ✅ |
| Explainability tables excluded from trigger | Explicitly documented | ✅ |
| Audit log SELECT limited to admin/approver | M-021 RLS | ✅ (OQ-05) |
| Audit log UPDATE/DELETE blocked | M-021 USING(false) | ✅ |
| old_values, new_values, change_delta stored | M-022 trigger function | ✅ |
| performed_by NULL for service-role | auth.uid() is nullable | ✅ |

---

## 7. Explainability Requirements (ADR-104)

| Requirement | Implementation | Status |
|-------------|---------------|--------|
| 5-table trace model | M-017 | ✅ |
| Traces are immutable (no updated_at) | No updated_at on trace tables | ✅ |
| cost_source_priority tracks precedence | CHECK BETWEEN 1 AND 6 OR NULL | ✅ |
| manual_adj traceable (source_type = 'manual_adjustment') | cost_source_traces design | ✅ |
| Rule engine traced | rule_execution_traces per trace_line | ✅ |
| Exception engine traced | exception_execution_traces | ✅ |
| Priority 0 (manual_adj) represented as NULL priority | Design decision (OQ-04) | ✅ |

---

## 8. MVP Scope Alignment

| Feature | In Schema | In MVP UI | Status |
|---------|-----------|-----------|--------|
| SKU CRUD | ✅ | ✅ Phase 2 | On track |
| BOM management | ✅ | ✅ Phase 2 | On track |
| Cost Sets | ✅ | ✅ Phase 3 | On track |
| Cost roll-up engine | ✅ | ✅ Phase 3 | On track |
| Explainability traces | ✅ | ✅ Phase 3 | On track |
| Validation engine | ✅ | ✅ Phase 3 | On track |
| Inventory valuation | ✅ | ✅ Phase 4 | On track |
| Projects | ✅ | ❌ Phase 2 | Deferred (OQ-09) |
| Suppliers UI | ✅ | ❌ Phase 4 | Deferred |
| Multi-currency | ❌ | ❌ Future | Correct (OQ-01) |
| PDF export | ❌ | ❌ Future | Correct |
| BOM diff view | ❌ | ❌ Future | Correct |

---

## 9. Open Risks After Audit

| Risk ID | Description | Severity | Mitigation |
|---------|-------------|----------|-----------|
| R-01 | Polymorphic scope_id FKs (cost_items, rule_exceptions) have no DB-level enforcement | MEDIUM | Application-layer validation + Zod schemas. Supabase row-level type checks at write time. |
| R-02 | Migrations not yet applied to any Supabase instance | HIGH | Next action: `supabase db push` on dev instance |
| R-03 | supabase.auth.users must exist before M-003 can run | HIGH | Run `supabase start` (Docker) before `supabase db push` |
| R-04 | Deferred FK ordering is implicit (file naming only) | MEDIUM | Numbered migration files enforce order; document explicitly in DEPLOYMENT.md |
| R-05 | cost_source_priority CHECK allows NULL — manual_adj not visually distinct in trace | LOW | `cost_source_type = 'manual_adjustment'` makes it distinguishable; document in engine spec |

---

## 10. Audit Verdict

**Status: APPROVED for implementation**

All material naming inconsistencies resolved. Schema is internally consistent, RLS coverage is complete, audit triggers cover all 23 business tables, and explainability architecture is correctly modeled. No blocking issues.

**Immediate next step:** Provision Supabase dev instance and apply migrations.
