# BOM Costing Platform — Architecture Decision Records

**Last updated:** 2026-06-17

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
