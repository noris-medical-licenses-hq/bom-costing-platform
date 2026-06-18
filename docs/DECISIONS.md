# BOM Costing Platform — Architecture Decision Records

**Last updated:** 2026-06-18

---

## ADR-001: Monorepo over separate repositories

**Status:** Accepted  
**Date:** 2026-06-17

**Context:** The platform has a frontend, backend services, database migrations, and tests. These are tightly coupled — a schema change typically requires coordinated changes in migrations, backend types, and frontend components.

**Decision:** Single monorepo with `/frontend`, `/backend`, `/database`, `/tests` directories.

**Consequences:**
- (+) Atomic commits across layers (migration + service + UI in one PR).
- (+) Shared TypeScript types without an npm package indirection.
- (-) Slightly more complex CI pipeline (must scope build/test to changed areas).
- (-) All contributors need the full toolchain installed locally.

---

## ADR-002: Supabase as the data platform

**Status:** Accepted  
**Date:** 2026-06-17

**Context:** Need managed PostgreSQL with built-in auth, RLS, and a good local development story. Team already has Supabase familiarity.

**Decision:** Supabase for auth, database, storage, and migrations (via Supabase CLI).

**Consequences:**
- (+) RLS enforced at database layer — no application-level auth gaps.
- (+) Auto-generated TypeScript types from schema via `supabase gen types`.
- (+) Local development via `supabase start` (Docker).
- (-) Vendor dependency; migration away from Supabase later would require rewiring auth and RLS.
- (-) `service_role` key must be handled carefully — never in client code.

---

## ADR-003: Next.js App Router (not separate API server)

**Status:** Accepted  
**Date:** 2026-06-17

**Context:** Considered a separate Express/FastAPI backend, but the team is TypeScript-first and the App Router's server actions eliminate a separate API layer for most CRUD operations.

**Decision:** Next.js 14 App Router with server actions and API routes. Business logic lives in `/backend/services/` called by server actions.

**Consequences:**
- (+) Single deployment unit for frontend + API (Vercel).
- (+) Server actions enforce server-only execution — no accidental client-side exposure of secrets.
- (-) Harder to expose a standalone REST API for future ERP integrations (mitigated by API routes in `/app/api/`).
- (-) Next.js version upgrades must be tracked carefully.

---

## ADR-004: Self-referencing BOM lines (adjacency list) for multi-level BOMs

**Status:** Accepted  
**Date:** 2026-06-17

**Context:** Medical device BOMs are commonly multi-level (sub-assemblies within assemblies). Two options: adjacency list (`parent_line_id` self-reference) or a closure table.

**Decision:** Adjacency list (`bom_lines.parent_line_id`). Roll-up traversal done in application code (not recursive SQL), given BOMs are rarely deeper than 5 levels.

**Consequences:**
- (+) Simpler schema, easier to reason about.
- (+) Application-layer traversal is straightforward for shallow trees.
- (-) Deep recursive queries would require `WITH RECURSIVE` or multiple round-trips; acceptable given known depth constraints.

---

## ADR-005: Audit log via database trigger (not application code)

**Status:** Accepted  
**Date:** 2026-06-17

**Context:** Regulatory traceability requires every data mutation to be logged. Logging in application code risks silent gaps if a code path is missed.

**Decision:** PostgreSQL trigger on all business tables writes to `audit_log` with old/new values as JSONB.

**Consequences:**
- (+) Audit coverage is guaranteed regardless of which code path writes the data.
- (+) Tamper-resistant — cannot be bypassed by application bugs.
- (-) Trigger must be updated if table schema changes significantly (column renames).
- (-) Bulk imports create audit_log rows at scale — bulk import jobs should be isolated.

---

## ADR-006: Zod for all input validation

**Status:** Accepted  
**Date:** 2026-06-17

**Context:** Need runtime validation at API boundaries. Options: Zod, Yup, or hand-written checks.

**Decision:** Zod. Schemas live in `/backend/validators/` and are reused on the frontend for form validation.

**Consequences:**
- (+) Single source of truth for shape validation, shared across server and client.
- (+) TypeScript inference from Zod schemas eliminates duplicate type declarations.
- (-) Bundle size impact on frontend (mitigated by server-only validator imports where possible).

---

## ADR-101: Unified SKU Model (replaces separate Product + Component tables)

**Status:** Accepted  
**Date:** 2026-06-17

**Decision:** Use a single `skus` table with `item_type` and `make_buy` instead of separate `products` and `components` tables.

**Reason:** A single entity prevents FK ambiguity in `bom_lines` and correctly models make-or-buy flexibility.

---

## ADR-102: Cost Set as Organization-Wide Context (replaces BOM-scoped Scenarios)

**Status:** Accepted  
**Date:** 2026-06-17

**Decision:** Organization-wide `cost_sets` replace per-BOM `cost_scenarios`. Scenario comparison = same BOM under Cost Set A vs B.

**Reason:** Central overhead rates propagate to all BOMs instantly. No per-BOM duplication.

---

## ADR-103: Frozen Cost at Snapshot Time

**Status:** Accepted  
**Date:** 2026-06-17

**Decision:** `unit_cost` and `total_value` are written as concrete numbers on `inventory_lines` at approval. `cost_set_snapshot` JSONB freezes the cost parameters. No recalculation needed for historical retrieval.

---

## ADR-104: Calculation Trace Written by Engine, Read by UI

**Status:** Accepted  
**Date:** 2026-06-17

**Decision:** The cost engine writes an immutable trace. The UI reads traces — never generates explanations independently.

---

## ADR-105: Validation Engine is Separate from Calculation Engine

**Status:** Accepted  
**Date:** 2026-06-17

**Decision:** Validation runs independently (on-demand, pre-calculation, scheduled). The cost engine calls it as Stage 2 but validation logic is not embedded in calculation stages.

---

## ADR-106: BOM Cycle Detection at Write Time

**Status:** Accepted  
**Date:** 2026-06-17

**Decision:** Cycle check runs on every `bom_lines` INSERT or UPDATE before the write commits. The database must never contain a circular BOM.

---

## ADR-107: Rule Engine Operates on Resolved Unit Costs

**Status:** Accepted  
**Date:** 2026-06-17

**Decision:** Cost Rules fire after the cost precedence hierarchy resolves a unit cost (Stage 5), not on raw data.

---

---

# Open Question Resolutions (OQ-01 through OQ-10)

**Resolved:** 2026-06-18  
**Resolution approach:** MVP-first defaults. All 10 questions resolved autonomously.

---

## OQ-01: Multi-currency in MVP

**Decision:** Single currency only in MVP.  
**Rationale:** FX conversion adds significant complexity. Most initial BOMs are single-currency. `cost_items.currency` must match `cost_sets.base_currency` — enforced at the application layer (Zod schema validates match at write time). No DB CHECK constraint to avoid complex cross-table check.  
**Schema impact:** No exchange_rates table in MVP. `cost_items.currency` column exists for Phase 2 multi-currency without migration. When Phase 2 arrives: add `exchange_rates` table and `exchange_rate_id` FK to engine outputs — no breaking changes.

---

## OQ-02: Duplicate BOM lines policy

**Decision:** Warning only (V-BOM-003). No hard DB block.  
**Rationale:** Same component at same BOM level with different reference designators (R1, R2) is a legitimate engineering pattern. A DB unique constraint would incorrectly block this. Warning surfaces the issue for user review without blocking the save.

---

## OQ-03: rule_conditions and rule_actions immutability

**Decision:** Application-layer enforcement (not RLS).  
**Rationale:** App-layer validation returns user-friendly error messages. RLS constraint returns a DB error which is harder to present meaningfully in UI. Consistent with all other app-layer constraint enforcement in this model.  
**Implementation note:** Before any write to `rule_conditions` or `rule_actions`, the application checks `cost_rules.is_active`. If `is_active = true`, write is rejected with error code `RULE_IS_ACTIVE_IMMUTABLE`. The RLS INSERT policy on rule_conditions also enforces this at DB level as a secondary guard (belt-and-suspenders for conditions).

---

## OQ-04: manual_cost_adjustments precedence level

**Decision:** Priority 0 — highest precedence, applied before Cost Set Items (Priority 1).  
**Rationale:** A manual adjustment is an explicit override requiring approval. It should win over everything. This is consistent with the principle: "most intentional, most recently approved cost wins."  
**Engine impact:** The cost engine checks `manual_cost_adjustments` first (Priority 0) before evaluating the 6-level cost precedence hierarchy (Priorities 1–6). Manual adjustments are themselves recorded in `cost_source_traces` with `priority_level = 0` and `source_type = 'manual_adjustment'`.

---

## OQ-05: audit_log viewer role access

**Decision:** admin and approver roles only.  
**Rationale:** Audit log contains full old/new row data which may include sensitive cost and user information. Restricting to admin and approver provides appropriate access control while satisfying regulatory requirements (approvers must be able to audit their own approval decisions). Phase 2 can add a filtered "my actions" view for cost_analysts.

---

## OQ-06: SKU archive cascade warnings

**Decision:** Pre-archive validation check warns about all active references. User must confirm. No auto-cascade.  
**Rationale:** Auto-cascading archive would silently break BOM lines, supplier prices, and cost items that reference the SKU. The validation engine runs a pre-archive check (similar to V-SKU-002) and presents findings to the user. The user confirms with awareness of the impact. Existing references are preserved; the archived SKU triggers Validation V-BOM-006 (WARNING) when subsequently scanned.

---

## OQ-07: validation_findings auto-resolve

**Decision:** Yes — auto-resolve open findings when the underlying condition is fixed on the next successful validation run.  
**Rationale:** Reduces noise in the validation findings list. A resolved finding remains in the database (status = 'resolved') with system as the resolver. This is safer than leaving stale open findings that confuse users.  
**Implementation:** When a validation run completes, for each finding from the previous run for the same `(entity_type, entity_id, rule_id)` combination that no longer triggers: update status to 'resolved', set resolved_at = now(), resolved_by = NULL (system).

---

## OQ-08: BOM version effective date enforcement in cost engine

**Decision:** Always use the approved version, regardless of effective dates. Dates are informational only in MVP.  
**Rationale:** Simplifies the engine and is more predictable. If a BOM has an approved version, that is the version used for costing regardless of `effective_from`/`effective_to`. Phase 2 can add date-aware BOM resolution (select the approved version whose effective_from <= valuation_date) without breaking changes.

---

## OQ-09: Projects in MVP or Phase 2

**Decision:** Phase 2. `projects` table is in the MVP schema but project-scoped inventory is not exposed in the MVP UI.  
**Rationale:** Project-level inventory tracking adds UI complexity. The `projects` table, `inventory_snapshots.scope_project_id`, and related FKs are in the schema so Phase 2 requires no migrations. The MVP UI simply does not expose the project scope option.

---

## OQ-10: profiles.last_seen_at update frequency

**Decision:** Session creation only (not per-request).  
**Rationale:** Per-request updates create high write frequency on `profiles`, which would compete with RLS policy evaluations that read `profiles` on every query. Updating only on session creation (via Supabase Auth hook) is sufficient for the business purpose and keeps write load low.
