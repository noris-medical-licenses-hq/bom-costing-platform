# Migration Execution Order

All migrations in `database/migrations/` must be run in ascending filename order.
The timestamp prefix `20260618000NNN_` enforces this order when using `supabase db push` or `psql`.

---

## Execution Sequence

| # | File | Creates | Depends On | Failure Points |
|---|---|---|---|---|
| M-001 | `20260618000001_extensions.sql` | `uuid-ossp`, `pgcrypto`, `update_updated_at_column()` | PostgreSQL only | Extension not available in restricted DB |
| M-002 | `20260618000002_organizations.sql` | `organizations` table | M-001 | `default_cost_set_id` stub column (FK added in M-010) |
| M-003 | `20260618000003_profiles.sql` | `profiles`, `auth_org_id()`, `auth_user_role()`, `auth_has_role()` | M-002, `auth.users` | Supabase Auth must be enabled; `auth` schema must exist |
| M-004 | `20260618000004_families_subfamilies.sql` | `families`, `subfamilies` | M-002, M-003 | FK to `profiles` for `created_by`/`updated_by` |
| M-005 | `20260618000005_suppliers.sql` | `suppliers` | M-002, M-003 | `is_qualified` boolean — app must handle unqualified suppliers |
| M-006 | `20260618000006_skus.sql` | `skus` | M-004, M-005, M-003 | `default_supplier_id → suppliers(id)` nullable FK |
| M-007 | `20260618000007_supplier_prices.sql` | `supplier_prices` | M-006, M-005, M-003 | `effective_to IS NULL OR effective_to > effective_from` check |
| M-008 | `20260618000008_virtual_components.sql` | `virtual_components` | M-002, M-003 | — |
| M-009 | `20260618000009_sites_warehouses.sql` | `sites`, `warehouses` | M-002, M-003 | `warehouse_type` check — only 5 allowed values |
| M-010 | `20260618000010_cost_sets.sql` | `cost_sets`; patches `organizations.default_cost_set_id` FK | M-002, M-003 | Deferred FK on `organizations` fails if table not exist yet |
| M-011 | `20260618000011_cost_items.sql` | `cost_items` | M-010, M-006, M-004, M-005, M-008, M-003 | Polymorphic `scope_id` — DB cannot enforce; enforced at app layer |
| M-012 | `20260618000012_cost_rules.sql` | `cost_rules`, `rule_conditions`, `rule_actions`, `rule_exceptions` | M-010, M-003 | `effective_from NOT NULL` — no default; must be provided on insert |
| M-013 | `20260618000013_manual_cost_adjustments.sql` | `manual_cost_adjustments` | M-006, M-003; bom_versions FK added in M-015 | `bom_version_id` stub column; FK added in M-015 |
| M-014 | `20260618000014_projects.sql` | `projects` | M-002, M-003 | — |
| M-015 | `20260618000015_boms.sql` | `boms`, `bom_versions`, `bom_lines`; patches `manual_cost_adjustments.bom_version_id` FK | M-006, M-008, M-013, M-003 | `bom_lines.line_type IN ('sku','virtual_component')` check; `bom_lines_exactly_one_ref_check` |
| M-016 | `20260618000016_inventory.sql` | `inventory_snapshots`, `inventory_lines`, `inventory_valuation_results` | M-009, M-006, M-010, M-014, M-003 | `cost_trace_id` stub column; FK added in M-020 |
| M-017 | `20260618000017_calculation_traces.sql` | `calculation_traces`, `calculation_trace_lines`, `rule_execution_traces`, `exception_execution_traces`, `cost_source_traces` | M-006, M-010, M-012, M-015, M-003 | — |
| M-018 | `20260618000018_validation.sql` | `validation_runs`, `validation_findings` | M-006, M-015, M-003 | — |
| M-019 | `20260618000019_audit_log.sql` | `audit_log` | M-002, M-003 | Append-only — RLS blocks UPDATE/DELETE enforced in M-021 |
| M-020 | `20260618000020_deferred_fks.sql` | `inventory_lines.cost_trace_id → calculation_traces(id)` | M-016, M-017 | Both tables must exist; will fail if applied before M-017 |
| M-021 | `20260618000021_rls.sql` | RLS policies on all 28 business tables | ALL previous migrations | Helper functions `auth_org_id()` must exist from M-003 |
| M-022 | `20260618000022_audit_triggers.sql` | `audit_log_trigger()` function; triggers on 21 business tables | M-019, ALL table migrations | `SECURITY DEFINER` — trigger owner must have `INSERT` on `audit_log` |
| M-023 | `20260618000023_indexes.sql` | Non-unique performance indexes | ALL table migrations | Duplicate index names will error if migration is re-run |

---

## Dependencies Graph (Critical Path)

```
M-001 (extensions)
  └─ M-002 (organizations)
       └─ M-003 (profiles + auth helpers)
            ├─ M-004 (families / subfamilies)
            │    └─ M-006 (skus) ─────────────────────────────────────────┐
            ├─ M-005 (suppliers) ─────────────────────────────────────────┤
            ├─ M-008 (virtual_components) ───────────────────────────────┐│
            ├─ M-009 (sites / warehouses) ──────────────────────────┐    ││
            ├─ M-010 (cost_sets) ────── [patches M-002 FK]         │    ││
            │    └─ M-011 (cost_items)                              │    ││
            │    └─ M-012 (cost_rules / conditions / actions)       │    ││
            │    └─ M-013 (manual_cost_adjustments) ─────────────┐ │    ││
            ├─ M-014 (projects)                                   │ │    ││
            └─ M-015 (boms / bom_versions / bom_lines) ──────────┘ │    ││
                 [patches M-013 FK]                                 │    ││
                 └─ M-016 (inventory) ──────────────────────────────┘    ││
                      └─ M-017 (calculation_traces) ──────────────────────┘│
                           └─ M-020 (deferred FKs) [patches M-016]        │
                 └─ M-018 (validation)                                     │
            └─ M-019 (audit_log) ────────────────────────────────────────┘
                 └─ M-021 (RLS policies — all tables)
                 └─ M-022 (audit triggers — all tables)
                 └─ M-023 (indexes)
```

---

## Expected Success Indicators

After all 23 migrations run:

```sql
-- Count tables
SELECT count(*) FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
-- Expected: 28

-- Verify RLS enabled
SELECT tablename FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = false;
-- Expected: 0 rows (all tables have RLS)

-- Verify audit triggers
SELECT count(*) FROM information_schema.triggers
WHERE trigger_schema = 'public' AND trigger_name LIKE 'audit_%';
-- Expected: 21

-- Verify helper functions exist
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('auth_org_id', 'auth_user_role', 'auth_has_role', 'update_updated_at_column');
-- Expected: 4 rows
```

---

## Possible Failure Points and Remediation

| Failure | Cause | Fix |
|---|---|---|
| M-001 fails: extension not found | `pgcrypto` not available | Enable in Supabase dashboard: Database → Extensions |
| M-003 fails: `auth` schema missing | Supabase Auth not enabled | Enable in Supabase dashboard: Authentication → Settings |
| M-020 fails: FK constraint violation | M-016 or M-017 not applied yet | Ensure sequential order; check `supabase_migrations.schema_migrations` |
| M-021 fails: function `auth_org_id` missing | M-003 not applied | Re-apply M-003 first |
| M-022 fails: `INSERT on audit_log denied` | RLS applied before trigger owner set | Apply M-021 after M-022, or check `SECURITY DEFINER` ownership |
| M-023 fails: duplicate index | Migration run twice | `CREATE INDEX IF NOT EXISTS` not used — safe to run `DROP INDEX ... IF EXISTS` and re-run |
| Any migration: `relation already exists` | Migration partially ran before | Inspect `supabase_migrations.schema_migrations` and resume from last clean migration |

---

## Rollback Guidance

**Individual migration rollback:**
All tables in each migration must be dropped in reverse FK order. There is no auto-generated rollback script. For pilot/demo environments, the safest rollback is to reset the entire database:

```bash
supabase db reset  # destroys all data and re-runs all migrations
```

**Partial rollback (tables only, no data):**
Drop tables in reverse order. Example for M-015:
```sql
DROP TABLE IF EXISTS bom_lines CASCADE;
DROP TABLE IF EXISTS bom_versions CASCADE;
DROP TABLE IF EXISTS boms CASCADE;
-- Undo deferred FK on manual_cost_adjustments:
ALTER TABLE manual_cost_adjustments DROP CONSTRAINT IF EXISTS manual_cost_adjustments_bom_version_id_fkey;
```

**Migrations requiring human intervention:**
- M-002: Any production change to `organizations` needs DBA review (it's the root multi-tenant entity)
- M-021: Any RLS policy change is security-critical — requires explicit review per CLAUDE.md rules
- M-019: `audit_log` retention policy change requires legal/compliance review (EU MDR 7-year minimum)

---

## RLS Coverage

All 28 business tables have RLS enabled (verified in M-021). No table has `USING (true)` policies.

The audit_log table has:
- SELECT restricted to `approver` and `admin` roles only
- UPDATE blocked for all roles (immutability)
- DELETE blocked for all roles (immutability)
- INSERT via `SECURITY DEFINER` trigger only (no app-user INSERT policy)

---

## Verification Command

```bash
npm run verify-migrations           # static: checks naming, sequences, destructive statements
npm run verify-migrations -- --live # requires SUPABASE_DB_URL; checks against live DB
```
