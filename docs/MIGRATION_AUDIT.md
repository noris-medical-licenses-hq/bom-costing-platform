# Migration Readiness Report

**Date:** 2026-06-18  
**Scope:** All 23 migration files (M-001 through M-023)  
**Status:** READY TO APPLY

---

## 1. Migration Inventory

| File | Tables Created | Critical Features |
|------|---------------|-------------------|
| M-001 extensions | — | uuid-ossp, pgcrypto, `update_updated_at_column()` fn |
| M-002 organizations | organizations | default_cost_set_id stub (no FK yet) |
| M-003 profiles | profiles | auth helper functions: `auth_org_id()`, `auth_user_role()`, `auth_has_role()` |
| M-004 families_subfamilies | families, subfamilies | org-scoped UNIQUE codes |
| M-005 suppliers | suppliers | ISO-2 country CHECK |
| M-006 skus | skus | item_type + make_buy CHECK, unified model |
| M-007 supplier_prices | supplier_prices | effective_date CHECK, price > 0 CHECK |
| M-008 virtual_components | virtual_components | description non-empty CHECK |
| M-009 sites_warehouses | sites, warehouses | warehouse_type CHECK |
| M-010 cost_sets | cost_sets | + deferred FK patch: organizations.default_cost_set_id |
| M-011 cost_items | cost_items | scope_type 7-value CHECK, polymorphic scope_id |
| M-012 cost_rules | cost_rules, rule_conditions, rule_actions, rule_exceptions | pipeline_stage CHECK, justification non-empty CHECK |
| M-013 manual_cost_adjustments | manual_cost_adjustments | bom_version_id stub (no FK yet) |
| M-014 projects | projects | status CHECK |
| M-015 boms | boms, bom_versions, bom_lines | C-02 partial unique index, C-03 CHECK, deferred FK patch: manual_cost_adjustments.bom_version_id |
| M-016 inventory | inventory_snapshots, inventory_lines, inventory_valuation_results | cost_trace_id stub, C-18 UNIQUE, frozen cost JSONB |
| M-017 calculation_traces | calculation_traces, calculation_trace_lines, rule_execution_traces, exception_execution_traces, cost_source_traces | append-only, no updated_at |
| M-018 validation | validation_runs, validation_findings | severity + status CHECKs |
| M-019 audit_log | audit_log | append-only, no updated_at, no trigger |
| M-020 deferred_fks | — | inventory_lines.cost_trace_id → calculation_traces FK |
| M-021 rls | — | RLS enabled on all 32 tables + all policies |
| M-022 audit_triggers | — | audit_log_trigger() SECURITY DEFINER + 23 triggers |
| M-023 indexes | — | 60+ indexes including 4 critical partial indexes |

---

## 2. Dependency Order Validation

```
M-001 (extensions)
  └── M-002 (organizations) — no FKs to business entities
       └── M-003 (profiles) — FK → auth.users, organizations
  └── M-004 (families, subfamilies) — FK → organizations
  └── M-005 (suppliers) — FK → organizations
       └── M-006 (skus) — FK → organizations, families, subfamilies, suppliers
            └── M-007 (supplier_prices) — FK → skus, suppliers, profiles
  └── M-008 (virtual_components) — FK → organizations
  └── M-009 (sites, warehouses) — FK → organizations, sites
  └── M-010 (cost_sets) — FK → organizations; PATCHES organizations.default_cost_set_id
       └── M-011 (cost_items) — FK → cost_sets
       └── M-012 (cost_rules + sub-tables) — FK → cost_sets, profiles
       └── M-013 (manual_cost_adjustments) — FK → cost_sets, skus, profiles; bom_version_id STUB
  └── M-014 (projects) — FK → organizations, profiles
       └── M-015 (boms, bom_versions, bom_lines) — FK → skus, profiles; PATCHES manual_cost_adjustments
            └── M-016 (inventory) — FK → organizations, cost_sets, sites, warehouses, skus, profiles; cost_trace_id STUB
                 └── M-017 (calculation_traces) — FK → cost_sets, skus, bom_versions, profiles
                      └── M-020 (deferred_fks) — PATCHES inventory_lines.cost_trace_id
            └── M-018 (validation) — FK → organizations, profiles
  └── M-019 (audit_log) — FK → organizations; performed_by NULLABLE (no FK to profiles)
  └── M-021 (rls) — depends on all tables + auth helper functions from M-003
  └── M-022 (audit_triggers) — depends on all tables + audit_log from M-019
  └── M-023 (indexes) — depends on all tables
```

**Result: VALID. No circular dependencies. Three deferred FK patterns correctly resolved.**

---

## 3. Three Deferred FK Patterns

| Circular Pair | Stub In | FK Added In | Risk |
|--------------|---------|------------|------|
| organizations.default_cost_set_id ↔ cost_sets | M-002 | M-010 | ✅ Low — optional (nullable) |
| manual_cost_adjustments.bom_version_id ↔ bom_versions | M-013 | M-015 | ✅ Low — optional (nullable) |
| inventory_lines.cost_trace_id ↔ calculation_traces | M-016 | M-020 | ✅ Low — optional (nullable) |

All three are nullable stubs — no orphan data possible during the stub period.

---

## 4. Foreign Key Audit

| Table | FK Columns | Target | ON DELETE | Status |
|-------|-----------|--------|-----------|--------|
| profiles | user_id | auth.users(id) | CASCADE | ✅ |
| profiles | organization_id | organizations(id) | RESTRICT | ✅ |
| subfamilies | family_id | families(id) | RESTRICT | ✅ |
| subfamilies | organization_id | organizations(id) | RESTRICT | ✅ |
| skus | organization_id | organizations(id) | RESTRICT | ✅ |
| skus | family_id | families(id) | RESTRICT | ✅ nullable |
| skus | subfamily_id | subfamilies(id) | RESTRICT | ✅ nullable |
| skus | default_supplier_id | suppliers(id) | SET NULL | ✅ nullable |
| supplier_prices | sku_id | skus(id) | RESTRICT | ✅ |
| supplier_prices | supplier_id | suppliers(id) | RESTRICT | ✅ |
| boms | sku_id | skus(id) | RESTRICT | ✅ UNIQUE |
| bom_versions | bom_id | boms(id) | CASCADE | ✅ |
| bom_lines | bom_version_id | bom_versions(id) | RESTRICT | ✅ |
| bom_lines | parent_line_id | bom_lines(id) | RESTRICT | ✅ nullable, self-ref |
| bom_lines | sku_id | skus(id) | RESTRICT | ✅ nullable |
| bom_lines | virtual_component_id | virtual_components(id) | RESTRICT | ✅ nullable |
| cost_sets | organization_id | organizations(id) | RESTRICT | ✅ |
| cost_items | cost_set_id | cost_sets(id) | RESTRICT | ✅ |
| manual_cost_adjustments | bom_version_id | bom_versions(id) | RESTRICT | ✅ deferred |
| inventory_snapshots | cost_set_id | cost_sets(id) | RESTRICT | ✅ |
| inventory_lines | snapshot_id | inventory_snapshots(id) | CASCADE | ✅ |
| inventory_lines | cost_trace_id | calculation_traces(id) | SET NULL | ✅ deferred |
| calculation_traces | cost_set_id | cost_sets(id) | RESTRICT | ✅ |
| calculation_traces | bom_version_id | bom_versions(id) | RESTRICT | ✅ nullable |

---

## 5. Index Strategy Audit

| Category | Index Count | Critical Partial Indexes | Status |
|----------|-------------|-------------------------|--------|
| organization_id (RLS hot path) | 32 | — | ✅ Every tenant table covered |
| SKU domain | 4 + 1 partial | `idx_skus_active_family WHERE status='active'` | ✅ |
| Supplier price lookup | 3 + 1 partial | `idx_supplier_prices_current WHERE effective_to IS NULL` | ✅ |
| BOM tree traversal | 5 | — | ✅ parent_line, position, depth |
| Cost resolution (engine hot path) | 4 + 1 partial | `idx_cost_rules_active_priority WHERE is_active=true` | ✅ |
| Rule exceptions | 2 + 1 partial | `idx_rule_exceptions_active_lookup WHERE status='active'` | ✅ |
| Calculation trace navigation | 6 | — | ✅ |
| Validation findings | 4 | — | ✅ |
| Audit log | 4 | — | ✅ |
| BOM version approved (C-02) | 1 partial unique | `bom_versions_one_approved_per_bom WHERE status='approved'` | ✅ |

**Total indexes: 68 (including unique constraints created inline)**

---

## 6. RLS Completeness Audit

| Table Group | SELECT Policy | INSERT Policy | UPDATE Policy | DELETE Policy |
|------------|--------------|--------------|--------------|--------------|
| Foundation (org, profiles) | ✅ org-scoped | ✅ admin only / self | ✅ restricted | ✅ admin/self |
| Product Master (skus, families, etc.) | ✅ org-scoped | ✅ editor+ | ✅ editor+ | ✅ admin |
| BOM tables | ✅ org-scoped | ✅ editor+ | ✅ unlocked only | ✅ unlocked only |
| Cost Sets + Items | ✅ org-scoped | ✅ cost_analyst+ | ✅ unlocked only | ✅ cost_analyst+ |
| Cost Rules + Conditions | ✅ org-scoped | ✅ inactive-rule only | ✅ restricted | ✅ restricted |
| Manual Adjustments | ✅ org-scoped | ✅ cost_analyst+ | ✅ approver | ✅ approver |
| Inventory | ✅ org-scoped | ✅ draft-snapshot only | ✅ draft-snapshot only | ✅ draft-snapshot only |
| Explainability (5 tables) | ✅ org-scoped | ✅ (engine writes) | ❌ BLOCKED | ❌ BLOCKED |
| Validation (2 tables) | ✅ org-scoped | ✅ (engine writes) | ✅ engine updates | ❌ BLOCKED |
| Audit Log | ✅ admin+approver ONLY | ❌ BLOCKED (trigger only) | ❌ BLOCKED | ❌ BLOCKED |

**All 32 tables have RLS enabled. Audit log is write-protected from application layer — trigger is SECURITY DEFINER.**

---

## 7. Audit Field Completeness

| Table | created_at | updated_at | created_by | updated_by | Trigger |
|-------|-----------|-----------|-----------|-----------|---------|
| organizations | ✅ | ✅ | — | — | ✅ |
| profiles | ✅ | ✅ | — | — | ✅ |
| families | ✅ | ✅ | ✅ | ✅ | ✅ |
| subfamilies | ✅ | ✅ | ✅ | ✅ | ✅ |
| suppliers | ✅ | ✅ | ✅ | ✅ | ✅ |
| skus | ✅ | ✅ | ✅ | ✅ | ✅ |
| supplier_prices | ✅ | ✅ | ✅ | ✅ | ✅ |
| virtual_components | ✅ | ✅ | ✅ | ✅ | ✅ |
| sites | ✅ | ✅ | ✅ | ✅ | ✅ |
| warehouses | ✅ | ✅ | ✅ | ✅ | ✅ |
| projects | ✅ | ✅ | ✅ | ✅ | ✅ |
| cost_sets | ✅ | ✅ | ✅ | ✅ | ✅ |
| cost_items | ✅ | ✅ | ✅ | ✅ | ✅ |
| cost_rules | ✅ | ✅ | ✅ | ✅ | ✅ |
| rule_conditions | ✅ | — (immutable) | ✅ | — | ✅ |
| rule_actions | ✅ | — (immutable) | ✅ | — | ✅ |
| rule_exceptions | ✅ | ✅ | ✅ | ✅ | ✅ |
| manual_cost_adjustments | ✅ | ✅ | ✅ | — | ✅ |
| boms | ✅ | ✅ | ✅ | ✅ | ✅ |
| bom_versions | ✅ | ✅ | ✅ | ✅ | ✅ |
| bom_lines | ✅ | ✅ | ✅ | ✅ | ✅ |
| inventory_snapshots | ✅ | ✅ | ✅ | ✅ | ✅ |
| inventory_lines | ✅ | ✅ | — | — | ✅ |
| calculation_traces | ✅ | — (append-only) | ✅ | — | ❌ (system-written) |
| audit_log | ✅ | — (append-only) | — | — | ❌ (is the audit) |

---

## 8. Rollback Considerations

Migrations are forward-only (no `DOWN` migrations). Standard rollback strategy:

1. **Dev environment:** Drop the Supabase local Docker container and re-apply from scratch.
2. **Staging:** Create a snapshot of the DB before each migration batch; restore from snapshot if needed.
3. **Production (when applicable):** Never run irreversible schema changes without a pre-snapshot. All migrations should be reviewed in staging first.

No `DROP TABLE` or `DROP COLUMN` migrations exist yet. If removing a column is needed in the future, use a two-step approach:
1. Migration A: mark column nullable, stop writing to it.
2. Migration B (next release): DROP COLUMN after verifying zero reads.

---

## 9. Migration Readiness Verdict

| Check | Status |
|-------|--------|
| All 23 files present | ✅ |
| Dependency order correct | ✅ |
| No circular FK deadlocks | ✅ |
| All deferred FKs resolved | ✅ |
| RLS on all 32 tables | ✅ |
| Auth helper functions present | ✅ |
| Audit triggers on 23 business tables | ✅ |
| Partial indexes for hot-path queries | ✅ |
| All constraints match DATA_MODEL.md | ✅ |
| Supabase applied | ❌ PENDING |

**VERDICT: READY TO APPLY. Blocking item: `supabase db push` on dev instance.**
