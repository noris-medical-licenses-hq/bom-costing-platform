# BOM Costing & Inventory Valuation Platform
# Data Model Specification

**Version:** 2.0 — Complete Rewrite  
**Date:** 2026-06-17  
**Status:** Ready for Migration Planning  
**Supersedes:** DATA_MODEL.md v1.0  
**Authority:** Derived from BLUEPRINT.md v1.0

> This document is the authoritative logical data model. A senior engineer must be able  
> to produce PostgreSQL/Supabase migrations from this document alone, without making  
> any business assumptions.

---

## Table of Contents

1. [Purpose](#1-purpose)
2. [Design Principles](#2-design-principles)
3. [Entity Groups](#3-entity-groups)
4. [Full Entity List](#4-full-entity-list)
5. [Entity Definitions](#5-entity-definitions)
6. [Relationships](#6-relationships)
7. [Critical Constraints](#7-critical-constraints)
8. [Validation-Relevant Data Rules](#8-validation-relevant-data-rules)
9. [Cost Calculation Trace Model](#9-cost-calculation-trace-model)
10. [Inventory Valuation Model](#10-inventory-valuation-model)
11. [Audit Model](#11-audit-model)
12. [Row Level Security Intent](#12-row-level-security-intent)
13. [Indexing Strategy](#13-indexing-strategy)
14. [Out-of-Scope for Initial Schema](#14-out-of-scope-for-initial-schema)
15. [Open Questions](#15-open-questions)
16. [Implementation Readiness Checklist](#16-implementation-readiness-checklist)

---

# 1. Purpose

This document defines the complete logical data model for the BOM Costing & Inventory Valuation Platform. It covers:

- Every entity the system stores, with business justification for its existence
- All fields, types, constraints, and lifecycle rules
- Relationships between entities and how they compose
- Row Level Security intent per role
- Indexing strategy for performance-critical queries
- Explicit constraints that enforce business correctness
- The trace model that enables cost explainability
- The inventory valuation model that ensures historical reproducibility
- The audit model that satisfies regulatory requirements

This document does not contain SQL. It is the input to SQL migration authoring.

---

# 2. Design Principles

These principles govern every schema decision. When a trade-off is required, earlier principles take precedence.

| # | Principle | What it means in schema terms |
|---|-----------|-------------------------------|
| 1 | **Explainability First** | Every calculated cost must trace to a source record. No cost appears without a corresponding `calculation_trace` and `cost_source_trace` entry. |
| 2 | **Auditability** | Every business table carries `created_by`, `created_at`, `updated_by`, `updated_at`. The `audit_log` records before/after values for every mutation via database trigger. The `audit_log` is append-only. |
| 3 | **Multi-tenant isolation** | Every tenant-owned table includes `organization_id`. RLS policies ensure users can only access rows belonging to their organization. No exceptions. |
| 4 | **Context-based costing** | Cost is never an intrinsic property of a SKU. Cost is always resolved in the context of a `cost_set_id` and a `valuation_date`. The same SKU has different costs in different contexts. |
| 5 | **Reproducible historical calculations** | Inventory snapshot valuations freeze `unit_cost` and `total_value` as concrete values at approval time. A `cost_set_snapshot` JSONB column is also frozen. No recalculation is required to retrieve historical values. |
| 6 | **Business-user maintainability** | Cost rules, conditions, and actions are data rows, not code. A cost analyst can add or modify rules through the UI without a deployment. |
| 7 | **Prevention of silent cost corruption** | Missing costs return `null` with a warning flag — never silently zero. Calculations with missing costs are marked incomplete. Validation findings surface all data quality issues before they reach the cost engine. |
| 8 | **Minimal future breaking changes** | Extensible enums use text-backed domain columns where new values may be added (e.g., `item_type`, `cost_item_type`). Additive columns are preferred over structural rewrites. Separate tables for rule conditions and actions allow new condition fields and action types without schema migration. |

---

# 3. Entity Groups

| Group | Tables | Domain Purpose |
|-------|--------|---------------|
| **Tenant & Access** | `organizations`, `profiles` | Multi-tenant root; user identity and role |
| **Product Master** | `families`, `subfamilies`, `skus`, `suppliers`, `supplier_prices` | The item catalog and sourcing data |
| **BOM** | `boms`, `bom_versions`, `bom_lines` | Manufacturing recipes, versioned and immutable when approved |
| **Costing** | `cost_sets`, `cost_items`, `virtual_components`, `cost_rules`, `rule_conditions`, `rule_actions`, `rule_exceptions`, `manual_cost_adjustments` | All inputs to the cost calculation engine |
| **Context** | `sites`, `warehouses`, `projects` | Physical and logical locations for inventory valuation |
| **Inventory** | `inventory_snapshots`, `inventory_lines`, `inventory_valuation_results` | Point-in-time inventory with frozen valuations |
| **Explainability** | `calculation_traces`, `calculation_trace_lines`, `rule_execution_traces`, `exception_execution_traces`, `cost_source_traces` | Complete immutable record of every cost calculation decision |
| **Validation** | `validation_runs`, `validation_findings` | Structured data quality findings before and during calculation |
| **Audit** | `audit_log` | Append-only mutation history for regulatory compliance |

---

# 4. Full Entity List

| # | Table | Group | Row Count Expectation | Audit Trigger |
|---|-------|-------|-----------------------|---------------|
| 1 | `organizations` | Tenant & Access | Very low (1–10) | Yes |
| 2 | `profiles` | Tenant & Access | Low (5–200/org) | Yes |
| 3 | `families` | Product Master | Low (10–50/org) | Yes |
| 4 | `subfamilies` | Product Master | Low–Medium (20–200/org) | Yes |
| 5 | `skus` | Product Master | Medium (100–10,000/org) | Yes |
| 6 | `suppliers` | Product Master | Low–Medium (10–500/org) | Yes |
| 7 | `supplier_prices` | Product Master | Medium–High (grows continuously) | Yes |
| 8 | `boms` | BOM | One per manufactured SKU | Yes |
| 9 | `bom_versions` | BOM | Few per BOM (2–20) | Yes |
| 10 | `bom_lines` | BOM | Medium (10–500 per BOM version) | Yes |
| 11 | `cost_sets` | Costing | Low (2–20/org) | Yes |
| 12 | `cost_items` | Costing | Medium (50–1,000/cost set) | Yes |
| 13 | `virtual_components` | Costing | Low (5–50/org) | Yes |
| 14 | `cost_rules` | Costing | Low–Medium (5–100/org) | Yes |
| 15 | `rule_conditions` | Costing | Low–Medium (1–5 per rule) | Yes |
| 16 | `rule_actions` | Costing | Low (1–3 per rule) | Yes |
| 17 | `rule_exceptions` | Costing | Low (few per rule) | Yes |
| 18 | `manual_cost_adjustments` | Costing | Low (exception-basis only) | Yes |
| 19 | `sites` | Context | Very low (1–20/org) | Yes |
| 20 | `warehouses` | Context | Low (1–50/org) | Yes |
| 21 | `projects` | Context | Low–Medium (1–200/org) | Yes |
| 22 | `inventory_snapshots` | Inventory | Low–Medium (monthly per scope) | Yes |
| 23 | `inventory_lines` | Inventory | Medium–High (SKU count × snapshot count) | Yes |
| 24 | `inventory_valuation_results` | Inventory | Low (few rows per snapshot) | No |
| 25 | `calculation_traces` | Explainability | High (one per calculation run) | No |
| 26 | `calculation_trace_lines` | Explainability | Very high (one per BOM line per trace) | No |
| 27 | `rule_execution_traces` | Explainability | High (rules × BOM lines × traces) | No |
| 28 | `exception_execution_traces` | Explainability | Medium (exceptions × traces) | No |
| 29 | `cost_source_traces` | Explainability | High (one per BOM line per trace) | No |
| 30 | `validation_runs` | Validation | Medium (triggered frequently) | No |
| 31 | `validation_findings` | Validation | Medium–High (findings per run) | No |
| 32 | `audit_log` | Audit | Very high (all mutations, retained 7+ years) | — |

**Audit trigger note:** Tables marked "Yes" have a PostgreSQL AFTER INSERT/UPDATE/DELETE trigger that writes to `audit_log`. Explainability and validation tables are written by the application (not user mutations) and are themselves immutable or low-risk; they do not require the trigger.

---

# 5. Entity Definitions

## Notation

For every entity, fields are presented as:

| Column | Type | Null | Constraint | Description |

- **Type** is a logical type (text, integer, numeric, boolean, date, timestamptz, uuid, jsonb, enum)
- **Null** is `NOT NULL` or `nullable`
- **Enum values** are listed inline; all enums are implemented as PostgreSQL CHECK constraints on a text column unless otherwise noted, to allow additive extension without migration
- `created_by` / `updated_by` are uuid FKs to `profiles.id` on all business tables
- `organization_id` is a uuid FK to `organizations.id` on all tenant-owned tables
- All primary keys are `uuid` type, generated as UUID v4 at application layer

---

## 5.1 Tenant & Access

### `organizations`

**Purpose:** Root multi-tenant container. Every row in every other table belongs to one organization. Isolation between organizations is enforced at the RLS layer.

**Lifecycle:** Created by platform super-admin; no self-deletion. Status can be `suspended` to block access without data loss.

| Column | Type | Null | Constraint | Description |
|--------|------|------|-----------|-------------|
| `id` | uuid | NOT NULL | PK | Surrogate primary key |
| `name` | text | NOT NULL | | Full legal or trading name |
| `slug` | text | NOT NULL | UNIQUE | URL-safe identifier |
| `default_currency` | text | NOT NULL | CHECK ISO 4217, len=3 | Base currency for reporting |
| `default_cost_set_id` | uuid | nullable | FK → cost_sets | Optional default cost context |
| `status` | text | NOT NULL | CHECK IN ('active','suspended','archived') | Operational status |
| `created_at` | timestamptz | NOT NULL | DEFAULT now() | |
| `updated_at` | timestamptz | NOT NULL | DEFAULT now() | |

**RLS intent:** Super-admin managed. Application users see only their own organization row.

---

### `profiles`

**Purpose:** Extends Supabase `auth.users`. Stores the organization membership, display name, and role for every authenticated user. One profile per auth user per organization. Cross-organization users are not supported in MVP.

**Lifecycle:** Created on first login after invitation. Deactivated (never deleted) when a user leaves.

| Column | Type | Null | Constraint | Description |
|--------|------|------|-----------|-------------|
| `id` | uuid | NOT NULL | PK, FK → auth.users.id | Matches Supabase auth UID |
| `organization_id` | uuid | NOT NULL | FK → organizations | Org membership |
| `full_name` | text | NOT NULL | | Display name |
| `email` | text | NOT NULL | | Denormalized from auth.users for UI |
| `role` | text | NOT NULL | CHECK IN ('viewer','editor','cost_analyst','procurement','approver','admin') | Access role |
| `is_active` | boolean | NOT NULL | DEFAULT true | false = deactivated (soft) |
| `last_seen_at` | timestamptz | nullable | | Updated on session activity |
| `created_at` | timestamptz | NOT NULL | DEFAULT now() | |
| `updated_at` | timestamptz | NOT NULL | DEFAULT now() | |

**Unique constraint:** `(organization_id, email)` — one profile per email per org.

**Business rule:** `is_active = false` blocks login but preserves all historical references (audit_log, created_by, etc.).

**Roles (enum documentation):**

| Role | Read | Write Scope |
|------|------|------------|
| `viewer` | All tables | None |
| `editor` | All tables | skus, families, subfamilies, boms, bom_versions (draft), bom_lines |
| `cost_analyst` | All tables | editor scope + cost_sets, cost_items, cost_rules, rule_conditions, rule_actions, rule_exceptions (create/update, not approve) |
| `procurement` | All tables | editor scope + suppliers, supplier_prices |
| `approver` | All tables | cost_analyst + procurement scope + approve bom_versions, approve inventory_snapshots, approve rule_exceptions |
| `admin` | All tables | Full write within organization, including profiles |

---

## 5.2 Product Master

### `families`

**Purpose:** Top-level classification for SKUs. Drives cost rule targeting (rules can apply to all SKUs in a family) and reporting rollup.

**Lifecycle:** Created by admin; archived when no SKUs assigned (never deleted if referenced historically).

| Column | Type | Null | Constraint | Description |
|--------|------|------|-----------|-------------|
| `id` | uuid | NOT NULL | PK | |
| `organization_id` | uuid | NOT NULL | FK → organizations | |
| `code` | text | NOT NULL | UNIQUE (org_id, code) | Short uppercase code, e.g. ELEC |
| `name` | text | NOT NULL | | Full name, e.g. Electronic Components |
| `description` | text | nullable | | Business description |
| `is_active` | boolean | NOT NULL | DEFAULT true | |
| `created_by` | uuid | NOT NULL | FK → profiles | |
| `created_at` | timestamptz | NOT NULL | DEFAULT now() | |
| `updated_by` | uuid | NOT NULL | FK → profiles | |
| `updated_at` | timestamptz | NOT NULL | DEFAULT now() | |

---

### `subfamilies`

**Purpose:** Second-level classification under a family. Enables finer-grained cost rule targeting (e.g., all PCBs within Electronic Components).

| Column | Type | Null | Constraint | Description |
|--------|------|------|-----------|-------------|
| `id` | uuid | NOT NULL | PK | |
| `organization_id` | uuid | NOT NULL | FK → organizations | Denormalized from family for RLS |
| `family_id` | uuid | NOT NULL | FK → families | Parent family |
| `code` | text | NOT NULL | UNIQUE (family_id, code) | Short code, unique within family |
| `name` | text | NOT NULL | | |
| `description` | text | nullable | | |
| `is_active` | boolean | NOT NULL | DEFAULT true | |
| `created_by` | uuid | NOT NULL | FK → profiles | |
| `created_at` | timestamptz | NOT NULL | DEFAULT now() | |
| `updated_by` | uuid | NOT NULL | FK → profiles | |
| `updated_at` | timestamptz | NOT NULL | DEFAULT now() | |

---

### `skus`

**Purpose:** The universal item entity. Replaces the separate `products` and `components` tables from v1.0. Every article that appears in a BOM, is sourced from a supplier, or appears in inventory is a SKU. Item type and make/buy flag distinguish its role.

**Design decision (ADR-101):** A single `skus` table with `item_type` and `make_buy` is used instead of separate tables. This prevents the FK ambiguity in `bom_lines` ("does this line reference a product or a component?") and correctly models make-or-buy flexibility.

**Lifecycle:** `draft` → `active` → `discontinued` → `archived`. A discontinued SKU can still appear in existing approved BOMs; it cannot receive new supplier prices.

| Column | Type | Null | Constraint | Description |
|--------|------|------|-----------|-------------|
| `id` | uuid | NOT NULL | PK | |
| `organization_id` | uuid | NOT NULL | FK → organizations | |
| `part_number` | text | NOT NULL | UNIQUE (org_id, part_number) | Internal part number |
| `name` | text | NOT NULL | | Human-readable name |
| `description` | text | nullable | | |
| `item_type` | text | NOT NULL | CHECK IN ('purchased_part','sub_assembly','finished_good','service','virtual') | Manufacturing classification |
| `make_buy` | text | NOT NULL | CHECK IN ('make','buy','make_or_buy') | Sourcing strategy |
| `unit_of_measure` | text | NOT NULL | | pcs, kg, m, L, hr, etc. |
| `family_id` | uuid | nullable | FK → families | Classification (warning if null) |
| `subfamily_id` | uuid | nullable | FK → subfamilies | Must belong to family_id's family |
| `lead_time_days` | integer | nullable | CHECK >= 0 | Procurement lead time in calendar days |
| `is_regulated` | boolean | NOT NULL | DEFAULT false | Requires regulatory supplier qualification |
| `default_supplier_id` | uuid | nullable | FK → suppliers | Preferred sourcing supplier |
| `status` | text | NOT NULL | CHECK IN ('draft','active','discontinued','archived') | |
| `notes` | text | nullable | | |
| `created_by` | uuid | NOT NULL | FK → profiles | |
| `created_at` | timestamptz | NOT NULL | DEFAULT now() | |
| `updated_by` | uuid | NOT NULL | FK → profiles | |
| `updated_at` | timestamptz | NOT NULL | DEFAULT now() | |

**Business rules enforced at application layer (not DB constraints):**
- `make_buy = 'buy'` → must NOT have an associated `bom` record (Validation V-BOM-002)
- `item_type IN ('sub_assembly','finished_good')` AND `make_buy IN ('make','make_or_buy')` → SHOULD have an approved bom_version before costing (Validation V-COST-001)
- `status = 'discontinued'` → no new `supplier_prices` may be created
- `subfamily_id` must belong to `family_id` (FK traversal check at write time)

---

### `suppliers`

**Purpose:** Vendor registry. Suppliers are the source of `supplier_prices` and are referenced by cost rules (e.g., rules targeting suppliers from a specific country).

**Lifecycle:** `active` → `inactive` → `disqualified`. Historical prices are retained when a supplier is disqualified.

| Column | Type | Null | Constraint | Description |
|--------|------|------|-----------|-------------|
| `id` | uuid | NOT NULL | PK | |
| `organization_id` | uuid | NOT NULL | FK → organizations | |
| `code` | text | NOT NULL | UNIQUE (org_id, code) | Internal supplier code |
| `name` | text | NOT NULL | | Legal or trading name |
| `country` | text | NOT NULL | CHECK len=2 | ISO 3166-1 alpha-2 country code |
| `contact_name` | text | nullable | | Primary contact |
| `contact_email` | text | nullable | | |
| `is_qualified` | boolean | NOT NULL | DEFAULT false | Regulatory qualification status |
| `qualified_at` | timestamptz | nullable | | When qualification was granted |
| `qualified_by` | uuid | nullable | FK → profiles | Who granted qualification |
| `status` | text | NOT NULL | CHECK IN ('active','inactive','disqualified') | |
| `notes` | text | nullable | | |
| `created_by` | uuid | NOT NULL | FK → profiles | |
| `created_at` | timestamptz | NOT NULL | DEFAULT now() | |
| `updated_by` | uuid | NOT NULL | FK → profiles | |
| `updated_at` | timestamptz | NOT NULL | DEFAULT now() | |

---

### `supplier_prices`

**Purpose:** Time-ranged unit price for a SKU from a specific supplier. This is Priority 6 (lowest) in the cost precedence hierarchy — used when no Cost Set Item covers the SKU. Historical prices are retained by closing the `effective_to` date rather than deleting records.

| Column | Type | Null | Constraint | Description |
|--------|------|------|-----------|-------------|
| `id` | uuid | NOT NULL | PK | |
| `organization_id` | uuid | NOT NULL | FK → organizations | |
| `sku_id` | uuid | NOT NULL | FK → skus | The priced SKU |
| `supplier_id` | uuid | NOT NULL | FK → suppliers | The supplying vendor |
| `unit_price` | numeric | NOT NULL | CHECK > 0 | Price per unit |
| `currency` | text | NOT NULL | CHECK len=3 | ISO 4217 |
| `moq` | integer | nullable | CHECK > 0 | Minimum order quantity |
| `price_break_qty` | integer | nullable | CHECK >= moq OR moq IS NULL | Volume break quantity |
| `effective_from` | date | NOT NULL | | First date price is valid |
| `effective_to` | date | nullable | CHECK > effective_from OR NULL | Last date price is valid; null = still current |
| `is_quoted` | boolean | NOT NULL | DEFAULT false | True if a formal quote backs this price |
| `quote_reference` | text | nullable | | Quote document reference |
| `quote_valid_until` | date | nullable | | Expiry of the quote |
| `created_by` | uuid | NOT NULL | FK → profiles | |
| `created_at` | timestamptz | NOT NULL | DEFAULT now() | |
| `updated_by` | uuid | NOT NULL | FK → profiles | |
| `updated_at` | timestamptz | NOT NULL | DEFAULT now() | |

**Business rule (enforced by Validation V-SP-001):** No two `supplier_prices` for the same `(sku_id, supplier_id)` may have overlapping date ranges. Detected at write time; enforced by application layer.

**Active price resolution:** For a given `(sku_id, supplier_id, target_date)`, the active price is the row where `effective_from <= target_date AND (effective_to IS NULL OR effective_to >= target_date)`. If zero rows match: no price. If multiple rows match: data error, surfaces as Validation finding V-SP-001.

---

## 5.3 BOM

### `boms`

**Purpose:** Container entity. One `bom` per SKU that is manufactured. Holds the version list. Contains no cost data itself.

**Design note:** The `bom` entity's sole purpose is to provide a stable parent UUID that `bom_versions` reference. Costing always operates against a `bom_version`, never directly against a `bom`.

| Column | Type | Null | Constraint | Description |
|--------|------|------|-----------|-------------|
| `id` | uuid | NOT NULL | PK | |
| `organization_id` | uuid | NOT NULL | FK → organizations | |
| `sku_id` | uuid | NOT NULL | UNIQUE, FK → skus | The SKU this BOM defines. One BOM per SKU. |
| `notes` | text | nullable | | Engineering notes at BOM level |
| `created_by` | uuid | NOT NULL | FK → profiles | |
| `created_at` | timestamptz | NOT NULL | DEFAULT now() | |
| `updated_by` | uuid | NOT NULL | FK → profiles | |
| `updated_at` | timestamptz | NOT NULL | DEFAULT now() | |

**Unique constraint:** `(sku_id)` — exactly one BOM per SKU.

---

### `bom_versions`

**Purpose:** An immutable point-in-time snapshot of a BOM structure. Once approved, a BOM version is locked (`is_locked = true`) and cannot be modified. Changes require creating a new version.

**Lifecycle:** `draft` → `under_review` → `approved` → `superseded` → `archived`

| Column | Type | Null | Constraint | Description |
|--------|------|------|-----------|-------------|
| `id` | uuid | NOT NULL | PK | |
| `organization_id` | uuid | NOT NULL | FK → organizations | Denormalized from bom for RLS |
| `bom_id` | uuid | NOT NULL | FK → boms | Parent BOM container |
| `version_number` | integer | NOT NULL | UNIQUE (bom_id, version_number), CHECK > 0 | Sequential within BOM; never reused |
| `version_label` | text | nullable | | Human label, e.g. "Rev A" or "Production 2026-Q2" |
| `status` | text | NOT NULL | CHECK IN ('draft','under_review','approved','superseded','archived') | |
| `is_locked` | boolean | NOT NULL | DEFAULT false | True when approved; blocks all edits |
| `effective_from` | date | nullable | | When this version became production |
| `effective_to` | date | nullable | | When superseded; null = still current |
| `change_summary` | text | nullable | | Human description of changes from prior version |
| `approved_by` | uuid | nullable | FK → profiles | Who approved |
| `approved_at` | timestamptz | nullable | | When approved |
| `created_by` | uuid | NOT NULL | FK → profiles | |
| `created_at` | timestamptz | NOT NULL | DEFAULT now() | |
| `updated_by` | uuid | NOT NULL | FK → profiles | |
| `updated_at` | timestamptz | NOT NULL | DEFAULT now() | |

**Critical constraint:** Exactly one `bom_version` per `bom_id` may have `status = 'approved'` at any time. Enforced by a partial unique index: `UNIQUE (bom_id) WHERE status = 'approved'`.

**Business rule:** When `is_locked = true`, the application layer must reject any INSERT or UPDATE on `bom_lines` for this version. This is enforced at the application layer and as a pre-write check, not by a DB trigger.

---

### `bom_lines`

**Purpose:** A single ingredient in a BOM Version's manufacturing recipe. BOM lines form a tree via `parent_line_id`. The tree can be arbitrarily deep; there is no artificial depth limit in the schema.

**Line types:** A line references either a physical `sku` (purchased part or sub-assembly) or a `virtual_component` (non-physical cost element). Never both; never neither.

| Column | Type | Null | Constraint | Description |
|--------|------|------|-----------|-------------|
| `id` | uuid | NOT NULL | PK | |
| `organization_id` | uuid | NOT NULL | FK → organizations | Denormalized for RLS |
| `bom_version_id` | uuid | NOT NULL | FK → bom_versions | Owning BOM version |
| `parent_line_id` | uuid | nullable | FK → bom_lines (self) | Null = root-level line |
| `line_type` | text | NOT NULL | CHECK IN ('sku','virtual_component') | |
| `sku_id` | uuid | nullable | FK → skus | Set when line_type = 'sku' |
| `virtual_component_id` | uuid | nullable | FK → virtual_components | Set when line_type = 'virtual_component' |
| `quantity` | numeric | NOT NULL | CHECK > 0 | Required quantity per parent unit |
| `unit_of_measure` | text | NOT NULL | | Must be compatible with referenced entity's UOM |
| `position` | integer | NOT NULL | DEFAULT 0 | Display order within the same parent |
| `reference_designator` | text | nullable | | e.g., R1, C4 for electronics BOMs |
| `is_reference_only` | boolean | NOT NULL | DEFAULT false | If true: shown in BOM but excluded from cost |
| `notes` | text | nullable | | |
| `created_by` | uuid | NOT NULL | FK → profiles | |
| `created_at` | timestamptz | NOT NULL | DEFAULT now() | |
| `updated_by` | uuid | NOT NULL | FK → profiles | |
| `updated_at` | timestamptz | NOT NULL | DEFAULT now() | |

**CHECK constraint:** `(sku_id IS NOT NULL AND virtual_component_id IS NULL) OR (sku_id IS NULL AND virtual_component_id IS NOT NULL)` — exactly one reference type per line.

**CHECK constraint:** `quantity > 0`

**Cycle prevention (business rule, not DB constraint):** Before any `bom_lines` INSERT or UPDATE that sets `parent_line_id`, the application layer traverses the proposed ancestor chain upward to the root. If the candidate `sku_id` appears anywhere in the chain, the write is rejected with error code `CIRCULAR_BOM_REFERENCE`. This check runs in the application layer because graph traversal cannot be expressed as a DB CHECK constraint.

**Duplicate line rule:** Two lines with the same `(bom_version_id, parent_line_id, sku_id)` are flagged by Validation V-BOM-003 as a warning. They are not hard-blocked by a DB constraint because there are legitimate engineering reasons to list the same component twice under different reference designators.

---

## 5.4 Costing

### `cost_sets`

**Purpose:** A named, organization-wide reusable costing context. The cost engine always operates within a Cost Set. The same SKU costs differently in different Cost Sets. This replaces the per-BOM `cost_scenarios` from v1.0.

**Design decision (ADR-102):** Cost Sets are organization-wide, not BOM-specific. Scenario comparison = same BOM calculated under Cost Set A vs. Cost Set B.

**Lifecycle:** `draft` → `active` → `archived`. When `is_locked = true`, no new `cost_items` can be added (used to protect approved inventory snapshot cost contexts).

| Column | Type | Null | Constraint | Description |
|--------|------|------|-----------|-------------|
| `id` | uuid | NOT NULL | PK | |
| `organization_id` | uuid | NOT NULL | FK → organizations | |
| `code` | text | NOT NULL | UNIQUE (org_id, code) | Short identifier, e.g. STD-2026 |
| `name` | text | NOT NULL | | e.g. "Standard 2026", "Brazil Tariff Q1-2026" |
| `description` | text | nullable | | Business purpose |
| `cost_set_type` | text | NOT NULL | CHECK IN ('standard','budget','quote','actual','simulation') | Classification |
| `base_currency` | text | NOT NULL | CHECK len=3 | ISO 4217; all costs normalized here |
| `effective_from` | date | NOT NULL | | Validity start |
| `effective_to` | date | nullable | CHECK > effective_from OR NULL | Validity end; null = current |
| `is_locked` | boolean | NOT NULL | DEFAULT false | Locked when referenced by approved snapshot |
| `is_default` | boolean | NOT NULL | DEFAULT false | Organization default for new calculations |
| `status` | text | NOT NULL | CHECK IN ('draft','active','archived') | |
| `notes` | text | nullable | | |
| `created_by` | uuid | NOT NULL | FK → profiles | |
| `created_at` | timestamptz | NOT NULL | DEFAULT now() | |
| `updated_by` | uuid | NOT NULL | FK → profiles | |
| `updated_at` | timestamptz | NOT NULL | DEFAULT now() | |

---

### `cost_items`

**Purpose:** A single cost parameter within a Cost Set. Defines a cost value, how it applies, and to what it applies. Cost Items are the primary mechanism for assigning costs to SKUs, categories, and adjustments within a costing context.

**Cost precedence (from BLUEPRINT §4.2):** SKU-specific > SubFamily > Family > Supplier > SupplierCountry > Global. The engine resolves the most specific matching Cost Item.

| Column | Type | Null | Constraint | Description |
|--------|------|------|-----------|-------------|
| `id` | uuid | NOT NULL | PK | |
| `organization_id` | uuid | NOT NULL | FK → organizations | |
| `cost_set_id` | uuid | NOT NULL | FK → cost_sets | Owning Cost Set |
| `item_type` | text | NOT NULL | CHECK IN ('material_price','labor_rate','overhead_pct','freight_pct','duty_rate','tooling_fixed','scrap_rate','custom') | What kind of cost this is |
| `scope_type` | text | NOT NULL | CHECK IN ('global','family','subfamily','sku','supplier','supplier_country','virtual_component') | What this item applies to |
| `scope_id` | uuid | nullable | | FK to the scoped entity (family_id, subfamily_id, sku_id, supplier_id, virtual_component_id). Null when scope_type = 'global' or 'supplier_country'. |
| `scope_code` | text | nullable | | Used when scope_type = 'supplier_country': the 2-letter country code |
| `value` | numeric | NOT NULL | | The cost value or rate |
| `value_unit` | text | NOT NULL | CHECK IN ('currency_amount','percentage','rate_per_hour','rate_per_unit') | How to interpret `value` |
| `currency` | text | nullable | CHECK len=3 OR NULL | Required when value_unit = 'currency_amount' |
| `applies_to` | text | NOT NULL | CHECK IN ('per_unit','material_subtotal','labor_subtotal','bom_total') | What the value is applied against |
| `effective_from` | date | NOT NULL | | |
| `effective_to` | date | nullable | CHECK > effective_from OR NULL | |
| `is_active` | boolean | NOT NULL | DEFAULT true | |
| `notes` | text | nullable | | Business justification |
| `created_by` | uuid | NOT NULL | FK → profiles | |
| `created_at` | timestamptz | NOT NULL | DEFAULT now() | |
| `updated_by` | uuid | NOT NULL | FK → profiles | |
| `updated_at` | timestamptz | NOT NULL | DEFAULT now() | |

**Scope resolution logic (highest to lowest specificity, used by cost engine):**
1. `scope_type = 'sku'` AND `scope_id = target_sku_id`
2. `scope_type = 'subfamily'` AND `scope_id = target_sku.subfamily_id`
3. `scope_type = 'family'` AND `scope_id = target_sku.family_id`
4. `scope_type = 'supplier'` AND `scope_id = target_sku.default_supplier_id`
5. `scope_type = 'supplier_country'` AND `scope_code = target_sku.default_supplier.country`
6. `scope_type = 'global'`

---

### `virtual_components`

**Purpose:** Non-physical cost elements that contribute to BOM cost without corresponding inventory items. Examples: regulatory certification amortization, packaging, scrap factors, tooling amortization.

**Critical:** Without virtual components, real costs are hidden in component prices (non-auditable) or omitted (understated costs). Virtual components make these costs explicit, line-by-line traceable, and reportable.

| Column | Type | Null | Constraint | Description |
|--------|------|------|-----------|-------------|
| `id` | uuid | NOT NULL | PK | |
| `organization_id` | uuid | NOT NULL | FK → organizations | |
| `code` | text | NOT NULL | UNIQUE (org_id, code) | Short identifier |
| `name` | text | NOT NULL | | e.g. "CE Marking Amortization" |
| `description` | text | NOT NULL | | Business justification (required) |
| `cost_type` | text | NOT NULL | CHECK IN ('fixed_per_unit','percentage_of_material','percentage_of_bom_total','percentage_of_labor') | How cost is calculated |
| `default_value` | numeric | nullable | | Default rate/amount; overridden by cost_items |
| `default_currency` | text | nullable | CHECK len=3 OR NULL | When cost_type = 'fixed_per_unit' |
| `status` | text | NOT NULL | CHECK IN ('active','inactive') | |
| `notes` | text | nullable | | |
| `created_by` | uuid | NOT NULL | FK → profiles | |
| `created_at` | timestamptz | NOT NULL | DEFAULT now() | |
| `updated_by` | uuid | NOT NULL | FK → profiles | |
| `updated_at` | timestamptz | NOT NULL | DEFAULT now() | |

**Cost resolution for virtual components:** The cost engine first checks for a `cost_item` with `scope_type = 'virtual_component'` and `scope_id = virtual_component.id` in the active Cost Set. If found, uses that value. If not found, uses `default_value`. If neither exists, cost = null with a warning.

---

### `cost_rules`

**Purpose:** Header record for a business cost policy. A cost rule defines priority, applicability scope, and lifecycle. The actual matching logic is in `rule_conditions`; the modification logic is in `rule_actions`. Separating these allows multiple conditions (ANDed) and multiple actions per rule.

| Column | Type | Null | Constraint | Description |
|--------|------|------|-----------|-------------|
| `id` | uuid | NOT NULL | PK | |
| `organization_id` | uuid | NOT NULL | FK → organizations | |
| `name` | text | NOT NULL | | Human name, e.g. "China Import Duty 2026" |
| `description` | text | NOT NULL | | Business justification (required, non-empty) |
| `pipeline_stage` | text | NOT NULL | CHECK IN ('after_cost_resolution','after_rollup') | When in the calculation pipeline this rule fires. 'after_cost_resolution' = per leaf cost. 'after_rollup' = on the final BOM total. |
| `priority` | integer | NOT NULL | CHECK > 0 | Lower number = higher priority, evaluated first |
| `cost_set_scope_id` | uuid | nullable | FK → cost_sets | If set: rule only fires when this cost set is active |
| `effective_from` | date | NOT NULL | | |
| `effective_to` | date | nullable | CHECK > effective_from OR NULL | |
| `is_active` | boolean | NOT NULL | DEFAULT false | Must be explicitly activated; starts inactive |
| `requires_approval` | boolean | NOT NULL | DEFAULT true | If true: rule cannot be activated without approved_by |
| `approved_by` | uuid | nullable | FK → profiles | |
| `approved_at` | timestamptz | nullable | | |
| `created_by` | uuid | NOT NULL | FK → profiles | |
| `created_at` | timestamptz | NOT NULL | DEFAULT now() | |
| `updated_by` | uuid | NOT NULL | FK → profiles | |
| `updated_at` | timestamptz | NOT NULL | DEFAULT now() | |

---

### `rule_conditions`

**Purpose:** One condition that must be true for a `cost_rule` to fire. A rule may have multiple conditions; all must match (AND logic). Conditions with the same `logical_group` value are ANDed; different groups are ORed.

| Column | Type | Null | Constraint | Description |
|--------|------|------|-----------|-------------|
| `id` | uuid | NOT NULL | PK | |
| `organization_id` | uuid | NOT NULL | FK → organizations | |
| `cost_rule_id` | uuid | NOT NULL | FK → cost_rules | Owning rule |
| `condition_field` | text | NOT NULL | | Dot-notation path to evaluated field. E.g., `sku.family_id`, `supplier.country`, `sku.item_type`, `sku.make_buy`, `bom_line.depth` |
| `condition_operator` | text | NOT NULL | CHECK IN ('equals','not_equals','in','not_in','greater_than','less_than','is_null','is_not_null') | |
| `condition_value` | text | NOT NULL | | Serialized value(s). For 'in'/'not_in': comma-separated or JSON array. |
| `logical_group` | integer | NOT NULL | DEFAULT 0 | Conditions in same group are ANDed; different groups are ORed |
| `created_by` | uuid | NOT NULL | FK → profiles | |
| `created_at` | timestamptz | NOT NULL | DEFAULT now() | |

**Note:** `rule_conditions` are immutable once the rule is active. To change a condition on an active rule, deactivate the rule, create a new version.

---

### `rule_actions`

**Purpose:** What a `cost_rule` does when all its conditions match. A rule may have multiple actions (applied in sequence).

| Column | Type | Null | Constraint | Description |
|--------|------|------|-----------|-------------|
| `id` | uuid | NOT NULL | PK | |
| `organization_id` | uuid | NOT NULL | FK → organizations | |
| `cost_rule_id` | uuid | NOT NULL | FK → cost_rules | Owning rule |
| `action_type` | text | NOT NULL | CHECK IN ('add_percentage','add_fixed','multiply','replace_cost','exclude_from_rollup','cap_at_value','floor_at_value') | |
| `action_value` | numeric | nullable | | Percentage (0–100), multiplier, fixed amount, cap, or floor. Null for 'exclude_from_rollup'. |
| `action_currency` | text | nullable | CHECK len=3 OR NULL | Required when action_type = 'add_fixed', 'cap_at_value', or 'floor_at_value' |
| `applies_to_item_type` | text | nullable | | If set: action only applies to cost items of this type (e.g., only to 'material_price' costs) |
| `action_sequence` | integer | NOT NULL | DEFAULT 1 | Order in which actions are applied when multiple exist |
| `created_by` | uuid | NOT NULL | FK → profiles | |
| `created_at` | timestamptz | NOT NULL | DEFAULT now() | |

---

### `rule_exceptions`

**Purpose:** An approved override that suppresses or modifies a specific Cost Rule for a specific scope (SKU, BOM version, family, etc.). Exceptions represent known, justified departures from standard cost policy.

**Business rule:** Every exception requires a non-empty `business_justification`. Every exception must be approved by a user with `approver` or `admin` role before it takes effect.

| Column | Type | Null | Constraint | Description |
|--------|------|------|-----------|-------------|
| `id` | uuid | NOT NULL | PK | |
| `organization_id` | uuid | NOT NULL | FK → organizations | |
| `cost_rule_id` | uuid | NOT NULL | FK → cost_rules | Rule being excepted |
| `exception_scope_type` | text | NOT NULL | CHECK IN ('sku','bom_version','family','subfamily','supplier','warehouse','project') | What entity the exception applies to |
| `exception_scope_id` | uuid | NOT NULL | | FK to the relevant entity (based on scope_type) |
| `exception_type` | text | NOT NULL | CHECK IN ('skip_rule','override_value','override_basis') | What the exception does |
| `override_value` | numeric | nullable | | When exception_type = 'override_value': the value to use instead |
| `override_value_currency` | text | nullable | CHECK len=3 OR NULL | |
| `business_justification` | text | NOT NULL | CHECK length > 0 | Required. Why this exception is valid. |
| `status` | text | NOT NULL | CHECK IN ('requested','approved','active','expired','rejected') | |
| `approved_by` | uuid | nullable | FK → profiles | |
| `approved_at` | timestamptz | nullable | | |
| `rejection_reason` | text | nullable | | Required when status = 'rejected' |
| `effective_from` | date | NOT NULL | | |
| `effective_to` | date | nullable | CHECK > effective_from OR NULL | Null = indefinite |
| `requested_by` | uuid | NOT NULL | FK → profiles | |
| `created_by` | uuid | NOT NULL | FK → profiles | |
| `created_at` | timestamptz | NOT NULL | DEFAULT now() | |
| `updated_by` | uuid | NOT NULL | FK → profiles | |
| `updated_at` | timestamptz | NOT NULL | DEFAULT now() | |

---

### `manual_cost_adjustments`

**Purpose:** Explicit, approved cost overrides that are separate from the Cost Set hierarchy. Used when a cost analyst needs to apply a correction to a specific SKU in a specific context that cannot be expressed as a Cost Set Item or a Cost Rule (e.g., a one-time contractual adjustment, a dispute settlement price). All manual adjustments are auditable and require approval.

**Note:** Manual adjustments are applied in the cost engine as the final step before trace generation, at higher precedence than Cost Set Items. Their use should be minimized and reviewed regularly.

| Column | Type | Null | Constraint | Description |
|--------|------|------|-----------|-------------|
| `id` | uuid | NOT NULL | PK | |
| `organization_id` | uuid | NOT NULL | FK → organizations | |
| `sku_id` | uuid | NOT NULL | FK → skus | SKU to which adjustment applies |
| `cost_set_id` | uuid | nullable | FK → cost_sets | If set: applies only in this cost set context |
| `bom_version_id` | uuid | nullable | FK → bom_versions | If set: applies only in this BOM version |
| `adjustment_type` | text | NOT NULL | CHECK IN ('fixed_override','percentage_addition','fixed_addition') | |
| `adjustment_value` | numeric | NOT NULL | | |
| `adjustment_currency` | text | nullable | CHECK len=3 OR NULL | Required for 'fixed_override' and 'fixed_addition' |
| `reason` | text | NOT NULL | CHECK length > 0 | Required justification |
| `status` | text | NOT NULL | CHECK IN ('requested','approved','active','expired','rejected') | |
| `approved_by` | uuid | nullable | FK → profiles | |
| `approved_at` | timestamptz | nullable | | |
| `effective_from` | date | NOT NULL | | |
| `effective_to` | date | nullable | CHECK > effective_from OR NULL | |
| `created_by` | uuid | NOT NULL | FK → profiles | |
| `created_at` | timestamptz | NOT NULL | DEFAULT now() | |
| `updated_by` | uuid | NOT NULL | FK → profiles | |
| `updated_at` | timestamptz | NOT NULL | DEFAULT now() | |

---

## 5.5 Context

### `sites`

**Purpose:** A physical manufacturing, assembly, or storage location. Used to scope inventory snapshots and optionally to scope cost rule applicability.

| Column | Type | Null | Constraint | Description |
|--------|------|------|-----------|-------------|
| `id` | uuid | NOT NULL | PK | |
| `organization_id` | uuid | NOT NULL | FK → organizations | |
| `code` | text | NOT NULL | UNIQUE (org_id, code) | |
| `name` | text | NOT NULL | | e.g. "Frankfurt Plant" |
| `address` | text | nullable | | |
| `city` | text | nullable | | |
| `country` | text | nullable | CHECK len=2 OR NULL | ISO 3166-1 alpha-2 |
| `is_active` | boolean | NOT NULL | DEFAULT true | |
| `created_by` | uuid | NOT NULL | FK → profiles | |
| `created_at` | timestamptz | NOT NULL | DEFAULT now() | |
| `updated_by` | uuid | NOT NULL | FK → profiles | |
| `updated_at` | timestamptz | NOT NULL | DEFAULT now() | |

---

### `warehouses`

**Purpose:** A storage zone within a Site. Inventory lines are assigned to a warehouse. The warehouse type affects how its inventory is classified in valuation reports.

| Column | Type | Null | Constraint | Description |
|--------|------|------|-----------|-------------|
| `id` | uuid | NOT NULL | PK | |
| `organization_id` | uuid | NOT NULL | FK → organizations | Denormalized from site for RLS |
| `site_id` | uuid | NOT NULL | FK → sites | Parent site |
| `code` | text | NOT NULL | UNIQUE (site_id, code) | |
| `name` | text | NOT NULL | | e.g. "Raw Materials Store" |
| `warehouse_type` | text | NOT NULL | CHECK IN ('raw_materials','work_in_progress','finished_goods','quarantine','consignment') | |
| `is_active` | boolean | NOT NULL | DEFAULT true | |
| `created_by` | uuid | NOT NULL | FK → profiles | |
| `created_at` | timestamptz | NOT NULL | DEFAULT now() | |
| `updated_by` | uuid | NOT NULL | FK → profiles | |
| `updated_at` | timestamptz | NOT NULL | DEFAULT now() | |

---

### `projects`

**Purpose:** A logical cost center or project for which inventory can be tracked and valued independently. Allows project-specific valuation without affecting the main inventory.

| Column | Type | Null | Constraint | Description |
|--------|------|------|-----------|-------------|
| `id` | uuid | NOT NULL | PK | |
| `organization_id` | uuid | NOT NULL | FK → organizations | |
| `code` | text | NOT NULL | UNIQUE (org_id, code) | |
| `name` | text | NOT NULL | | |
| `description` | text | nullable | | |
| `status` | text | NOT NULL | CHECK IN ('active','on_hold','completed','cancelled') | |
| `start_date` | date | nullable | | |
| `end_date` | date | nullable | CHECK > start_date OR NULL | |
| `created_by` | uuid | NOT NULL | FK → profiles | |
| `created_at` | timestamptz | NOT NULL | DEFAULT now() | |
| `updated_by` | uuid | NOT NULL | FK → profiles | |
| `updated_at` | timestamptz | NOT NULL | DEFAULT now() | |

---

## 5.6 Inventory

### `inventory_snapshots`

**Purpose:** An immutable point-in-time record of physical inventory quantities, valued against a specific Cost Set on a specific date. Once approved, a snapshot is permanently locked. It is the source of all inventory valuation reporting.

**Critical design (ADR-103):** When a snapshot is approved, the full Cost Set parameters valid at `snapshot_date` are copied into `cost_set_snapshot` (JSONB). This ensures the valuation can be reproduced years later even if the live Cost Set is modified or archived.

| Column | Type | Null | Constraint | Description |
|--------|------|------|-----------|-------------|
| `id` | uuid | NOT NULL | PK | |
| `organization_id` | uuid | NOT NULL | FK → organizations | |
| `snapshot_name` | text | NOT NULL | | Human name, e.g. "Month-End June 2026 – Frankfurt" |
| `snapshot_date` | date | NOT NULL | | Reference date for quantities and prices |
| `snapshot_type` | text | NOT NULL | CHECK IN ('full','site','warehouse','project') | Scope classification |
| `cost_set_id` | uuid | NOT NULL | FK → cost_sets | Cost Set used for valuation |
| `cost_set_snapshot` | jsonb | nullable | | Frozen copy of all Cost Set Items at approval time |
| `scope_site_id` | uuid | nullable | FK → sites | Set when snapshot_type = 'site' or 'warehouse' |
| `scope_warehouse_id` | uuid | nullable | FK → warehouses | Set when snapshot_type = 'warehouse' |
| `scope_project_id` | uuid | nullable | FK → projects | Set when snapshot_type = 'project' |
| `status` | text | NOT NULL | CHECK IN ('draft','under_review','approved','superseded','archived') | |
| `total_quantity` | numeric | nullable | | Populated after valuation calculation |
| `total_value` | numeric | nullable | | Sum of all inventory_lines.total_value |
| `base_currency` | text | NOT NULL | CHECK len=3 | |
| `line_count` | integer | nullable | | Count of inventory_lines |
| `missing_cost_count` | integer | nullable | | Lines with no resolved cost |
| `notes` | text | nullable | | |
| `approved_by` | uuid | nullable | FK → profiles | |
| `approved_at` | timestamptz | nullable | | |
| `created_by` | uuid | NOT NULL | FK → profiles | |
| `created_at` | timestamptz | NOT NULL | DEFAULT now() | |
| `updated_by` | uuid | NOT NULL | FK → profiles | |
| `updated_at` | timestamptz | NOT NULL | DEFAULT now() | |

---

### `inventory_lines`

**Purpose:** One line per SKU per warehouse in an `inventory_snapshot`. Stores the quantity and the frozen resolved cost. The `unit_cost` and `total_value` are concrete numeric values written at valuation time — not references that could change.

| Column | Type | Null | Constraint | Description |
|--------|------|------|-----------|-------------|
| `id` | uuid | NOT NULL | PK | |
| `organization_id` | uuid | NOT NULL | FK → organizations | |
| `snapshot_id` | uuid | NOT NULL | FK → inventory_snapshots | |
| `sku_id` | uuid | NOT NULL | FK → skus | |
| `warehouse_id` | uuid | NOT NULL | FK → warehouses | |
| `quantity` | numeric | NOT NULL | CHECK > 0 | Physical quantity at snapshot_date |
| `unit_cost` | numeric | nullable | | Frozen unit cost at valuation time. Null = no cost resolved. |
| `total_value` | numeric | nullable | | Frozen: quantity × unit_cost. Null if unit_cost null. |
| `currency` | text | NOT NULL | CHECK len=3 | |
| `cost_trace_id` | uuid | nullable | FK → calculation_traces | The trace that produced unit_cost |
| `cost_source` | text | nullable | CHECK IN ('cost_set_item','supplier_price','bom_rollup','manual_adjustment','none') | |
| `bom_version_id` | uuid | nullable | FK → bom_versions | Which BOM was used if cost_source = 'bom_rollup' |
| `has_missing_cost` | boolean | NOT NULL | DEFAULT false | True when cost could not be resolved |
| `notes` | text | nullable | | |
| `created_by` | uuid | NOT NULL | FK → profiles | |
| `created_at` | timestamptz | NOT NULL | DEFAULT now() | |
| `updated_by` | uuid | NOT NULL | FK → profiles | |
| `updated_at` | timestamptz | NOT NULL | DEFAULT now() | |

**Unique constraint:** `(snapshot_id, sku_id, warehouse_id)` — one line per SKU per warehouse per snapshot.

---

### `inventory_valuation_results`

**Purpose:** Pre-aggregated valuation totals for reporting. Generated when a snapshot is approved. Provides fast access to totals by site, warehouse, family, or subfamily without re-scanning all inventory lines.

| Column | Type | Null | Constraint | Description |
|--------|------|------|-----------|-------------|
| `id` | uuid | NOT NULL | PK | |
| `organization_id` | uuid | NOT NULL | FK → organizations | |
| `snapshot_id` | uuid | NOT NULL | FK → inventory_snapshots | |
| `group_type` | text | NOT NULL | CHECK IN ('all','site','warehouse','family','subfamily') | Aggregation dimension |
| `group_id` | uuid | nullable | | FK to site, warehouse, family, or subfamily. Null when group_type = 'all'. |
| `group_name` | text | NOT NULL | | Denormalized for fast display |
| `total_quantity` | numeric | NOT NULL | | |
| `total_value` | numeric | NOT NULL | | |
| `currency` | text | NOT NULL | CHECK len=3 | |
| `line_count` | integer | NOT NULL | | |
| `missing_cost_count` | integer | NOT NULL | | |
| `created_by` | uuid | NOT NULL | FK → profiles | |
| `created_at` | timestamptz | NOT NULL | DEFAULT now() | |

**Note:** This table is write-once at snapshot approval time and never updated. If a snapshot is superseded, the old results remain (historical reference).

---

## 5.7 Explainability

### `calculation_traces`

**Purpose:** Immutable header record for a single cost calculation run. Written by the cost engine after successful completion. Every number in the UI that represents a calculated cost must reference a `calculation_trace`.

| Column | Type | Null | Constraint | Description |
|--------|------|------|-----------|-------------|
| `id` | uuid | NOT NULL | PK | |
| `organization_id` | uuid | NOT NULL | FK → organizations | |
| `trace_type` | text | NOT NULL | CHECK IN ('sku_cost','inventory_line') | What triggered this calculation |
| `sku_id` | uuid | NOT NULL | FK → skus | Top-level SKU being costed |
| `bom_version_id` | uuid | nullable | FK → bom_versions | BOM version used; null if SKU has no BOM |
| `cost_set_id` | uuid | NOT NULL | FK → cost_sets | Cost context |
| `valuation_date` | date | NOT NULL | | Date context for all price and rule resolution |
| `site_id` | uuid | nullable | FK → sites | |
| `warehouse_id` | uuid | nullable | FK → warehouses | |
| `project_id` | uuid | nullable | FK → projects | |
| `quantity` | numeric | NOT NULL | DEFAULT 1 | Quantity requested |
| `final_cost` | numeric | nullable | | Final computed unit cost. Null if calculation incomplete. |
| `currency` | text | NOT NULL | CHECK len=3 | |
| `has_warnings` | boolean | NOT NULL | DEFAULT false | |
| `warning_count` | integer | NOT NULL | DEFAULT 0 | |
| `missing_cost_count` | integer | NOT NULL | DEFAULT 0 | |
| `is_complete` | boolean | NOT NULL | DEFAULT false | Set to true after all trace lines written |
| `engine_version` | text | NOT NULL | | Semver of the calculation engine |
| `triggered_by` | uuid | NOT NULL | FK → profiles | |
| `triggered_at` | timestamptz | NOT NULL | | |
| `duration_ms` | integer | nullable | | Computation time |
| `trace_level` | text | NOT NULL | CHECK IN ('summary','detailed','full') | |
| `created_at` | timestamptz | NOT NULL | DEFAULT now() | |

**Immutability:** Once `is_complete = true`, no updates are permitted. Enforced at the application layer. `calculation_traces` do not have `updated_at` because they are immutable after creation.

---

### `calculation_trace_lines`

**Purpose:** One record per BOM line evaluated during a calculation. Mirrors the BOM tree structure via `parent_line_id`. Together, these records allow a user to navigate from the final cost to every individual line decision.

| Column | Type | Null | Constraint | Description |
|--------|------|------|-----------|-------------|
| `id` | uuid | NOT NULL | PK | |
| `organization_id` | uuid | NOT NULL | FK → organizations | |
| `trace_id` | uuid | NOT NULL | FK → calculation_traces | Owning trace |
| `parent_line_id` | uuid | nullable | FK → calculation_trace_lines (self) | Mirrors BOM parent |
| `bom_line_id` | uuid | nullable | FK → bom_lines | Source BOM line (null for virtual/adjustment lines) |
| `depth` | integer | NOT NULL | DEFAULT 0 | 0 = root |
| `position` | integer | NOT NULL | DEFAULT 0 | Order within parent |
| `line_type` | text | NOT NULL | CHECK IN ('sku','virtual_component','adjustment','rollup_subtotal') | |
| `sku_id` | uuid | nullable | FK → skus | |
| `virtual_component_id` | uuid | nullable | FK → virtual_components | |
| `quantity` | numeric | NOT NULL | | |
| `resolved_unit_cost` | numeric | nullable | | Cost before rules applied |
| `adjusted_unit_cost` | numeric | nullable | | Cost after all rules applied |
| `line_total` | numeric | nullable | | quantity × adjusted_unit_cost |
| `cost_source_priority` | integer | nullable | CHECK BETWEEN 1 AND 6 | Which level of cost hierarchy provided cost |
| `cost_source_type` | text | nullable | CHECK IN ('cost_set_item_sku','cost_set_item_subfamily','cost_set_item_family','cost_set_item_supplier','cost_set_item_global','supplier_price','bom_rollup','virtual_fixed','virtual_percentage','manual_adjustment','none') | |
| `cost_source_id` | uuid | nullable | | FK to the actual source record |
| `cost_source_table` | text | nullable | | Table name of the source record |
| `is_rolled_up` | boolean | NOT NULL | DEFAULT false | True if cost is the sum of child lines |
| `has_missing_cost` | boolean | NOT NULL | DEFAULT false | |
| `is_reference_only` | boolean | NOT NULL | DEFAULT false | |
| `warnings` | jsonb | nullable | | Array of warning strings for this line |
| `created_at` | timestamptz | NOT NULL | DEFAULT now() | |

---

### `rule_execution_traces`

**Purpose:** One record per cost rule evaluated during a calculation — whether the rule fired or not. This ensures a user can see not only which rules applied but which rules were considered and skipped.

| Column | Type | Null | Constraint | Description |
|--------|------|------|-----------|-------------|
| `id` | uuid | NOT NULL | PK | |
| `organization_id` | uuid | NOT NULL | FK → organizations | |
| `trace_id` | uuid | NOT NULL | FK → calculation_traces | |
| `trace_line_id` | uuid | NOT NULL | FK → calculation_trace_lines | Which BOM line this rule was evaluated against |
| `cost_rule_id` | uuid | NOT NULL | FK → cost_rules | |
| `rule_name_snapshot` | text | NOT NULL | | Frozen rule name at time of calculation |
| `rule_priority` | integer | NOT NULL | | Frozen priority at time of calculation |
| `condition_summary` | text | NOT NULL | | Human-readable summary of all conditions evaluated |
| `condition_result` | boolean | NOT NULL | | Did all conditions match? |
| `was_applied` | boolean | NOT NULL | | Was the rule actually applied (conditions matched AND not suppressed)? |
| `suppressed_by_exception_id` | uuid | nullable | FK → rule_exceptions | If suppressed: which exception caused it |
| `value_before` | numeric | nullable | | Cost before this rule |
| `value_after` | numeric | nullable | | Cost after this rule |
| `delta` | numeric | nullable | | value_after − value_before |
| `created_at` | timestamptz | NOT NULL | DEFAULT now() | |

---

### `exception_execution_traces`

**Purpose:** One record per rule exception that was evaluated during a calculation. Links a specific exception to the rule execution it suppressed.

| Column | Type | Null | Constraint | Description |
|--------|------|------|-----------|-------------|
| `id` | uuid | NOT NULL | PK | |
| `organization_id` | uuid | NOT NULL | FK → organizations | |
| `trace_id` | uuid | NOT NULL | FK → calculation_traces | |
| `trace_line_id` | uuid | NOT NULL | FK → calculation_trace_lines | |
| `rule_execution_trace_id` | uuid | NOT NULL | FK → rule_execution_traces | The rule execution this exception affected |
| `rule_exception_id` | uuid | NOT NULL | FK → rule_exceptions | |
| `exception_type_snapshot` | text | NOT NULL | | Frozen exception type at time of calculation |
| `justification_snapshot` | text | NOT NULL | | Frozen business_justification at time of calculation |
| `was_active` | boolean | NOT NULL | | Was this exception active on the valuation_date? |
| `suppression_applied` | boolean | NOT NULL | | Did this exception actually suppress the rule? |
| `created_at` | timestamptz | NOT NULL | DEFAULT now() | |

---

### `cost_source_traces`

**Purpose:** For each `calculation_trace_line`, records every cost source that was evaluated (checked) and which one was ultimately selected. Enables full visibility into the cost precedence resolution.

| Column | Type | Null | Constraint | Description |
|--------|------|------|-----------|-------------|
| `id` | uuid | NOT NULL | PK | |
| `organization_id` | uuid | NOT NULL | FK → organizations | |
| `trace_id` | uuid | NOT NULL | FK → calculation_traces | |
| `trace_line_id` | uuid | NOT NULL | FK → calculation_trace_lines | |
| `source_type` | text | NOT NULL | CHECK IN ('cost_set_item','supplier_price','manual_adjustment','virtual_component_default','none') | |
| `source_record_id` | uuid | nullable | | FK to the actual cost_item, supplier_price, or manual_cost_adjustment |
| `source_table` | text | nullable | | Table name of source_record_id |
| `scope_type` | text | nullable | | The scope_type of the cost_item that was evaluated |
| `resolved_value` | numeric | nullable | | The cost value from this source |
| `currency` | text | nullable | CHECK len=3 OR NULL | |
| `priority_level` | integer | nullable | CHECK BETWEEN 1 AND 6 | |
| `was_selected` | boolean | NOT NULL | | True = this source was used. False = evaluated but lower priority. |
| `rejection_reason` | text | nullable | | Why this source was not selected (e.g., "lower priority than sku-specific cost item") |
| `created_at` | timestamptz | NOT NULL | DEFAULT now() | |

---

## 5.8 Validation

### `validation_runs`

**Purpose:** A single execution of the validation engine. Records when it ran, what scope was validated, and the summary of findings. Individual findings are in `validation_findings`.

| Column | Type | Null | Constraint | Description |
|--------|------|------|-----------|-------------|
| `id` | uuid | NOT NULL | PK | |
| `organization_id` | uuid | NOT NULL | FK → organizations | |
| `run_type` | text | NOT NULL | CHECK IN ('on_demand','pre_calculation','pre_approval','scheduled') | What triggered this run |
| `scope_type` | text | NOT NULL | CHECK IN ('organization','sku','bom_version','cost_set','inventory_snapshot') | What was validated |
| `scope_id` | uuid | nullable | | The specific entity validated. Null = full org scan. |
| `triggered_by` | uuid | nullable | FK → profiles | Null for scheduled runs |
| `triggered_at` | timestamptz | NOT NULL | | |
| `completed_at` | timestamptz | nullable | | |
| `status` | text | NOT NULL | CHECK IN ('running','completed','failed') | |
| `total_findings` | integer | NOT NULL | DEFAULT 0 | |
| `error_count` | integer | NOT NULL | DEFAULT 0 | |
| `warning_count` | integer | NOT NULL | DEFAULT 0 | |
| `info_count` | integer | NOT NULL | DEFAULT 0 | |
| `engine_version` | text | NOT NULL | | |
| `created_at` | timestamptz | NOT NULL | DEFAULT now() | |

---

### `validation_findings`

**Purpose:** A single data quality issue found during a validation run. Findings are categorized by severity and category. Users can acknowledge and resolve findings; resolved findings are retained for audit.

| Column | Type | Null | Constraint | Description |
|--------|------|------|-----------|-------------|
| `id` | uuid | NOT NULL | PK | |
| `organization_id` | uuid | NOT NULL | FK → organizations | |
| `validation_run_id` | uuid | NOT NULL | FK → validation_runs | |
| `rule_id` | text | NOT NULL | | Validation rule code, e.g. 'V-BOM-001' |
| `rule_name` | text | NOT NULL | | Human name of the validation rule |
| `severity` | text | NOT NULL | CHECK IN ('error','warning','info') | |
| `category` | text | NOT NULL | CHECK IN ('structural','business','cost','inventory') | |
| `entity_type` | text | NOT NULL | | Table name of the affected entity |
| `entity_id` | uuid | nullable | | PK of the affected entity |
| `entity_display_name` | text | nullable | | Human-readable identifier (part_number, name) |
| `message` | text | NOT NULL | | What the finding is |
| `detail` | jsonb | nullable | | Structured additional context |
| `can_auto_fix` | boolean | NOT NULL | DEFAULT false | |
| `auto_fix_applied` | boolean | NOT NULL | DEFAULT false | |
| `status` | text | NOT NULL | CHECK IN ('open','acknowledged','resolved','suppressed') | |
| `resolved_by` | uuid | nullable | FK → profiles | |
| `resolved_at` | timestamptz | nullable | | |
| `resolution_notes` | text | nullable | | |
| `created_at` | timestamptz | NOT NULL | DEFAULT now() | |

---

## 5.9 Audit

### `audit_log`

**Purpose:** Append-only, immutable record of every data mutation in the system. Written by database triggers on all business tables. Satisfies the regulatory requirement that every change to costing-relevant data can be traced to an actor, a timestamp, and a before/after value.

**Immutability:** Enforced by RLS: `UPDATE` and `DELETE` on `audit_log` are blocked for all roles including `admin`. Only the database trigger (running as service role) can INSERT.

| Column | Type | Null | Constraint | Description |
|--------|------|------|-----------|-------------|
| `id` | uuid | NOT NULL | PK | |
| `organization_id` | uuid | NOT NULL | FK → organizations | |
| `event_type` | text | NOT NULL | CHECK IN ('data_insert','data_update','data_delete','bom_approved','bom_superseded','snapshot_approved','rule_activated','rule_deactivated','exception_approved','exception_rejected','calculation_executed','valuation_executed','user_invited','user_role_changed','user_deactivated','cost_set_locked','adjustment_approved') | |
| `event_category` | text | NOT NULL | CHECK IN ('data','workflow','rule','calculation','valuation','admin') | |
| `table_name` | text | nullable | | Business table affected (for data events) |
| `record_id` | uuid | nullable | | PK of the affected record |
| `performed_by` | uuid | nullable | FK → profiles | Null for system-triggered events |
| `performed_at` | timestamptz | NOT NULL | DEFAULT now() | Server-side timestamp |
| `session_id` | text | nullable | | Supabase session identifier |
| `ip_address` | text | nullable | | Client IP |
| `old_values` | jsonb | nullable | | Full row before mutation (update/delete) |
| `new_values` | jsonb | nullable | | Full row after mutation (insert/update) |
| `change_delta` | jsonb | nullable | | Only the changed fields |
| `reference_id` | uuid | nullable | | Associated trace_id, snapshot_id, etc. |
| `metadata` | jsonb | nullable | | Event-specific extra context |
| `created_at` | timestamptz | NOT NULL | DEFAULT now() | |

**No `updated_at`** — this table is append-only. No rows are ever modified after insertion.

---

# 6. Relationships

## Primary Entity Relationships

```
organizations
  ├── profiles (1:many)
  ├── families (1:many)
  │     └── subfamilies (1:many)
  ├── skus (1:many)
  │     ├── → family (many:1)
  │     ├── → subfamily (many:1)
  │     ├── → default_supplier (many:1)
  │     ├── boms (1:0..1)
  │     │     └── bom_versions (1:many)
  │     │           └── bom_lines (1:many, self-referential tree)
  │     │                 ├── → sku (many:1, for physical lines)
  │     │                 └── → virtual_component (many:1, for virtual lines)
  │     └── supplier_prices (1:many, via supplier)
  │
  ├── suppliers (1:many)
  │     └── supplier_prices (1:many)
  │           → sku
  │
  ├── virtual_components (1:many)
  │
  ├── cost_sets (1:many)
  │     └── cost_items (1:many)
  │
  ├── cost_rules (1:many)
  │     ├── rule_conditions (1:many)
  │     ├── rule_actions (1:many)
  │     └── rule_exceptions (1:many)
  │
  ├── manual_cost_adjustments (1:many)
  │
  ├── sites (1:many)
  │     └── warehouses (1:many)
  │
  ├── projects (1:many)
  │
  ├── inventory_snapshots (1:many)
  │     ├── → cost_set
  │     ├── → site / warehouse / project (optional scope)
  │     ├── inventory_lines (1:many)
  │     │     ├── → sku
  │     │     ├── → warehouse
  │     │     └── → calculation_trace (1:0..1)
  │     └── inventory_valuation_results (1:many)
  │
  ├── calculation_traces (1:many)
  │     ├── → sku
  │     ├── → bom_version
  │     ├── → cost_set
  │     ├── calculation_trace_lines (1:many, self-referential tree)
  │     │     ├── → bom_line
  │     │     ├── → sku
  │     │     └── → virtual_component
  │     ├── rule_execution_traces (1:many)
  │     │     ├── → cost_rule
  │     │     └── → rule_exception (suppressor)
  │     ├── exception_execution_traces (1:many)
  │     │     └── → rule_exception
  │     └── cost_source_traces (1:many)
  │           → cost_item or supplier_price (via polymorphic source_record_id)
  │
  ├── validation_runs (1:many)
  │     └── validation_findings (1:many)
  │
  └── audit_log (1:many)
```

## Key Cross-Entity Rules

| Relationship | Rule |
|-------------|------|
| `skus.subfamily_id` → `subfamilies` | `subfamilies.family_id` must equal `skus.family_id` |
| `bom_lines.sku_id` | Referenced SKU must be `status = 'active'` at write time (warning if discontinued in approved version) |
| `bom_lines` self-reference | Parent line must belong to the same `bom_version_id` |
| `cost_items.scope_id` | FK target varies by `scope_type`; enforced at application layer, not as DB FK |
| `rule_exceptions.exception_scope_id` | FK target varies by `exception_scope_type`; same pattern |
| `inventory_lines` | `snapshot_id`, `sku_id`, `warehouse_id` must all be active at snapshot creation time |
| `calculation_traces` | Written by engine only; never by user mutations |

---

# 7. Critical Constraints

These constraints must be enforced. Each is classified as DB-level (enforced by the database) or App-level (enforced by the application layer before writing).

| # | Constraint | Tables | Enforcement | Description |
|---|-----------|--------|-------------|-------------|
| C-01 | `quantity > 0` | `bom_lines`, `inventory_lines` | DB CHECK | Manufacturing and inventory quantities must be positive |
| C-02 | Exactly one approved BOM version per BOM | `bom_versions` | DB partial UNIQUE INDEX on `(bom_id) WHERE status = 'approved'` | Prevents two approved versions coexisting |
| C-03 | BOM line references exactly one entity | `bom_lines` | DB CHECK: `(sku_id IS NOT NULL AND virtual_component_id IS NULL) OR (sku_id IS NULL AND virtual_component_id IS NOT NULL)` | No null-null or both-not-null states |
| C-04 | No circular BOM references | `bom_lines` | App-level: ancestor traversal before insert/update | Enforced pre-write; schema cannot express graph constraints |
| C-05 | Locked/approved BOM versions are immutable | `bom_versions`, `bom_lines` | App-level: reject writes when `is_locked = true` | Schema has `is_locked`; enforcement is in write path |
| C-06 | No overlapping supplier price dates for same SKU+Supplier | `supplier_prices` | App-level + Validation V-SP-001 | Complex range overlap cannot be expressed as a simple CHECK |
| C-07 | `supplier_prices.effective_to > effective_from` | `supplier_prices` | DB CHECK | Date range sanity |
| C-08 | `cost_items` scope_id must reference existing entity | `cost_items` | App-level: validated at write time | Polymorphic FK cannot be enforced at DB level |
| C-09 | Rule exceptions require `business_justification` non-empty | `rule_exceptions` | DB CHECK: `length(trim(business_justification)) > 0` | Regulatory requirement |
| C-10 | Rule exceptions require approval before taking effect | `rule_exceptions` | App-level: status = 'active' only when approved_by IS NOT NULL | |
| C-11 | `audit_log` is append-only | `audit_log` | RLS: no UPDATE, no DELETE for any role | Immutability for regulatory compliance |
| C-12 | `calculation_traces` are immutable after `is_complete = true` | `calculation_traces` and children | App-level: reject writes when is_complete | |
| C-13 | `inventory_lines` are immutable when snapshot is approved | `inventory_lines`, `inventory_snapshots` | App-level: reject writes when snapshot.status = 'approved' | |
| C-14 | `is_default` cost set: at most one per organization | `cost_sets` | App-level: unset others when setting new default | Cannot express as DB constraint without trigger |
| C-15 | `profiles`: unique email per organization | `profiles` | DB UNIQUE (organization_id, email) | |
| C-16 | `skus`: unique part_number per organization | `skus` | DB UNIQUE (organization_id, part_number) | |
| C-17 | `boms`: unique per sku_id | `boms` | DB UNIQUE (sku_id) | One BOM container per SKU |
| C-18 | `inventory_lines`: unique SKU+warehouse per snapshot | `inventory_lines` | DB UNIQUE (snapshot_id, sku_id, warehouse_id) | |
| C-19 | `manual_cost_adjustments` require `reason` non-empty | `manual_cost_adjustments` | DB CHECK: `length(trim(reason)) > 0` | |
| C-20 | `cost_rules.description` is non-empty | `cost_rules` | DB CHECK: `length(trim(description)) > 0` | Business justification required for all rules |

---

# 8. Validation-Relevant Data Rules

These are the business rules that the Validation Engine (Section 7 of BLUEPRINT.md) evaluates. The schema must store sufficient data to detect and report each finding.

| Rule ID | Finding Name | Category | Severity | Detection | Schema Dependency |
|---------|-------------|----------|----------|-----------|-------------------|
| V-BOM-001 | Circular BOM Reference | Structural | ERROR | Traverse `bom_lines.parent_line_id` upward; detect cycle | `bom_lines` self-ref |
| V-BOM-002 | BOM on Buy-only SKU | Structural | ERROR | `skus.make_buy = 'buy'` AND `boms.sku_id` exists | `skus`, `boms` |
| V-BOM-003 | Duplicate BOM Line | Structural | WARNING | Same `(bom_version_id, parent_line_id, sku_id)` appears twice | `bom_lines` |
| V-BOM-004 | BOM Line with Zero or Negative Quantity | Structural | ERROR | `bom_lines.quantity <= 0` (also enforced by CHECK) | `bom_lines` |
| V-BOM-005 | Approved BOM Version with No Lines | Structural | ERROR | `bom_versions.status = 'approved'` AND no `bom_lines` | `bom_versions`, `bom_lines` |
| V-BOM-006 | BOM Line References Inactive SKU | Business | WARNING | `bom_lines.sku_id` → `skus.status != 'active'` | `bom_lines`, `skus` |
| V-BOM-007 | BOM Line UOM Mismatch | Structural | ERROR | `bom_lines.unit_of_measure != skus.unit_of_measure` | `bom_lines`, `skus` |
| V-SKU-001 | Missing SKU Classification | Business | WARNING | `skus.family_id IS NULL` for active SKU | `skus` |
| V-SKU-002 | Orphan SKU | Business | WARNING | Active SKU not in any `bom_lines` and not in any `inventory_lines` | `skus`, `bom_lines`, `inventory_lines` |
| V-SKU-003 | Missing Cost for Purchased SKU | Cost | WARNING | Active `skus.make_buy IN ('buy','make_or_buy')` with no `supplier_prices` and no `cost_items` scoped to it | `skus`, `supplier_prices`, `cost_items` |
| V-SP-001 | Overlapping Supplier Price Dates | Structural | ERROR | Two `supplier_prices` rows for same `(sku_id, supplier_id)` with overlapping date ranges | `supplier_prices` |
| V-SP-002 | Stale Supplier Price | Cost | WARNING | Active `supplier_prices.effective_from < (snapshot_date - 365 days)` | `supplier_prices` |
| V-COST-001 | Active SKU Has No Resolvable Cost in Context | Cost | WARNING | Cost resolution returns null for active SKU in given cost_set | `cost_items`, `supplier_prices`, `skus` |
| V-COST-002 | Cost Set Has No Global Overhead Item | Cost | WARNING | `cost_items` with `cost_set_id` has no row with `item_type = 'overhead_pct'` and `scope_type = 'global'` | `cost_items` |
| V-COST-003 | Expired Cost Set Referenced | Cost | ERROR | `cost_sets.effective_to < valuation_date` | `cost_sets` |
| V-COST-004 | Currency Mismatch Without Exchange Rate | Cost | ERROR | `cost_items.currency != cost_sets.base_currency` (Phase 2: exchange rate table not yet in schema) | `cost_items`, `cost_sets` |
| V-RULE-001 | Broken Rule Exception | Business | WARNING | `rule_exceptions.cost_rule_id` → `cost_rules.is_active = false` | `rule_exceptions`, `cost_rules` |
| V-RULE-002 | Invalid Rule Condition Field | Business | ERROR | `rule_conditions.condition_field` references a field that does not exist in the domain model | `rule_conditions` |
| V-RULE-003 | Unapproved Rule Exception (Pending >48h) | Business | WARNING | `rule_exceptions.status = 'requested'` AND `created_at < now() - interval '48 hours'` | `rule_exceptions` |
| V-RULE-004 | Active Rule Without Approval | Business | ERROR | `cost_rules.is_active = true` AND `cost_rules.requires_approval = true` AND `cost_rules.approved_by IS NULL` | `cost_rules` |
| V-INV-001 | Inventory Line Without Resolvable Cost | Inventory | ERROR | `inventory_lines.has_missing_cost = true` in a snapshot approaching approval | `inventory_lines` |
| V-INV-002 | Inventory Quantity Zero or Negative | Inventory | ERROR | `inventory_lines.quantity <= 0` (also enforced by CHECK) | `inventory_lines` |
| V-INV-003 | SKU Discontinued in Inventory | Inventory | WARNING | `inventory_lines.sku_id` → `skus.status = 'discontinued'` | `inventory_lines`, `skus` |
| V-INV-004 | Context Mismatch | Inventory | ERROR | Snapshot `scope_warehouse_id` → `warehouses.site_id != scope_site_id` | `inventory_snapshots`, `warehouses` |

---

# 9. Cost Calculation Trace Model

## Purpose

The trace model is the schema implementation of the Explainability First principle. Every numerical cost output produced by the platform must be navigable from final cost down to source data.

## Navigation Path (Drill-Down Model)

```
User sees: SKU "MED-DEVICE-001" cost = €42.17
              │
              ▼
calculation_traces  (trace_id = X)
  ├── triggered_by, triggered_at, cost_set_id, valuation_date
  ├── final_cost = 42.17, currency = EUR
  └── is_complete = true, engine_version = "1.0.0"
              │
              ▼
calculation_trace_lines  (parent_line_id IS NULL = root lines)
  ├── Line 1: PCB Assembly (sku, depth=0)
  │     resolved_unit_cost = 18.40, adjusted_unit_cost = 18.40
  │     is_rolled_up = true
  │     cost_source_type = 'bom_rollup'
  │         │
  │         ▼ (child lines of PCB Assembly, depth=1)
  │     ├── Line 1.1: Resistor 10kΩ × 500
  │     │     resolved_unit_cost = 0.02, cost_source_type = 'supplier_price'
  │     │     cost_source_id = <supplier_prices.id>
  │     └── Line 1.2: Capacitor 100nF × 200
  │           resolved_unit_cost = 0.008, cost_source_type = 'cost_set_item_subfamily'
  │           cost_source_id = <cost_items.id>
  │
  ├── Line 2: Housing (sku, depth=0)
  │     resolved_unit_cost = 4.20, adjusted_unit_cost = 4.41 (after duty rule)
  │     cost_source_type = 'supplier_price'
  │
  ├── Line 3: CE Marking Amortization (virtual_component, depth=0)
  │     line_type = 'virtual_component', cost_source_type = 'virtual_fixed'
  │     adjusted_unit_cost = 1.20
  │
  └── Line 4: Overhead 12% (adjustment, depth=0)
        line_type = 'adjustment', applies_to = 'material_subtotal'
        adjusted_unit_cost = 4.44
              │
              ▼
rule_execution_traces  (for Line 2: Housing)
  ├── cost_rule_id = <Germany Import Duty rule>
  │     condition_result = true, was_applied = true
  │     value_before = 4.20, value_after = 4.41, delta = 0.21
  └── cost_rule_id = <EU Freight Surcharge rule>
        condition_result = false, was_applied = false
              │
              ▼
cost_source_traces  (for Line 1.1: Resistor)
  ├── source_type = 'cost_set_item', scope_type = 'sku', was_selected = false
  │     rejection_reason = 'no sku-specific cost item found'
  ├── source_type = 'cost_set_item', scope_type = 'subfamily', was_selected = false
  │     rejection_reason = 'no subfamily cost item found'
  └── source_type = 'supplier_price', was_selected = true
        resolved_value = 0.02, source_record_id = <supplier_prices.id>
```

## Trace Completeness

A trace is marked `is_complete = true` only after all child records are written. The engine writes:
1. `calculation_traces` header (is_complete = false)
2. All `calculation_trace_lines` (bottom-up order)
3. All `rule_execution_traces` per line
4. All `exception_execution_traces` per rule execution
5. All `cost_source_traces` per line
6. Update `calculation_traces.is_complete = true` and `final_cost`

If the engine fails between steps 1 and 6, the trace is orphaned (`is_complete = false`). Orphaned traces older than 1 hour should be flagged by a maintenance job.

## Trace Retention

Calculation traces are retained for the life of the platform. They must not be deleted. Archival to cold storage after 3 years is acceptable if queries still return results within 30 seconds via index.

---

# 10. Inventory Valuation Model

## Purpose

Inventory valuation answers: "What is the monetary value of our physical inventory, expressed in cost terms, at a given point in time?" The model must ensure that any historical valuation is reproducible years after it was computed.

## How Valuation Relates to the Cost Engine

```
inventory_snapshots  (context: date, scope, cost_set)
        │
        ▼ (one per SKU per warehouse)
inventory_lines  (quantity entered by user)
        │
        ▼ (cost engine called per line)
calculation_traces  (one trace per inventory_line.sku_id)
        │
        ▼ (frozen output)
inventory_lines.unit_cost  ← concrete numeric (not a reference)
inventory_lines.total_value ← quantity × unit_cost (concrete)
inventory_lines.cost_trace_id ← FK to the trace for drill-down
        │
        ▼ (aggregated at snapshot approval)
inventory_valuation_results  (rollup by site / warehouse / family)
```

## Valuation Lifecycle

| Stage | Status | Who | What Happens |
|-------|--------|-----|-------------|
| 1. Create snapshot | `draft` | Editor/Admin | Set name, date, scope, cost_set |
| 2. Enter quantities | `draft` | Editor | Add inventory_lines (sku_id, warehouse_id, quantity) |
| 3. Run validation | `draft` | System (pre-approval) | V-INV-001 through V-INV-004 checked |
| 4. Trigger valuation | `draft` | Cost Analyst | Cost engine called per line; unit_cost and cost_trace_id frozen |
| 5. Submit for review | `under_review` | Editor | Snapshot locked for editing |
| 6. Review & approve | `approved` | Approver | cost_set_snapshot frozen; inventory_valuation_results generated; is_locked |
| 7. Supersede | `superseded` | System | Previous approved snapshot for same scope superseded when new one approved |

## Reproducibility Mechanism

The reproducibility guarantee has two layers:

**Layer 1 — Frozen numeric values:** `inventory_lines.unit_cost` and `total_value` are concrete numbers written at valuation time. No recalculation is ever needed to retrieve a historical value.

**Layer 2 — Frozen Cost Set snapshot:** When a snapshot is approved, the system copies the full effective Cost Set (all `cost_items` valid at `snapshot_date`) into `inventory_snapshots.cost_set_snapshot` (JSONB). This preserves the exact parameter set that produced the valuation, even if the live Cost Set is later modified or archived.

**Layer 3 — Calculation traces:** Each `inventory_lines.cost_trace_id` references the exact calculation trace that produced the unit cost. The trace records every decision made — which cost source was used, which rules fired, which exceptions were applied.

Together, these three layers mean: given an approved inventory snapshot, the valuation is fully reproducible and fully explainable without re-executing any computation.

## Valuation Scope Rules

| snapshot_type | scope_site_id | scope_warehouse_id | scope_project_id | Meaning |
|--------------|--------------|-------------------|-----------------|---------|
| `full` | null | null | null | All warehouses in the organization |
| `site` | set | null | null | All warehouses within one site |
| `warehouse` | set | set | null | One specific warehouse |
| `project` | null | null | set | Inventory attributed to a project |

**Consistency rule:** For `snapshot_type = 'warehouse'`, `scope_warehouse_id` must belong to `scope_site_id`. Enforced by Validation V-INV-004.

## Valuation Results Aggregation

When a snapshot is approved, `inventory_valuation_results` rows are generated:
- One row for `group_type = 'all'` (total)
- One row per distinct `site_id` in the snapshot's lines
- One row per distinct `warehouse_id` in the snapshot's lines
- One row per distinct `family_id` of the SKUs in the snapshot's lines
- One row per distinct `subfamily_id` of the SKUs in the snapshot's lines

These rows are never updated after creation. They serve as the fast-read layer for reporting without requiring aggregation queries over potentially thousands of inventory lines.

---

# 11. Audit Model

## Scope

The audit system covers two distinct concerns:

1. **Data mutation audit** — every INSERT, UPDATE, DELETE on business tables
2. **Workflow event audit** — approvals, activations, locks, and lifecycle transitions that carry business significance beyond the raw data change

Both are stored in `audit_log`. Workflow events add context (e.g., "BOM approved" carries more meaning than a raw UPDATE on `bom_versions.status`).

## Trigger Coverage

A PostgreSQL AFTER trigger writes to `audit_log` for every INSERT, UPDATE, and DELETE on the following tables:

```
organizations, profiles,
families, subfamilies, skus, suppliers, supplier_prices,
boms, bom_versions, bom_lines,
cost_sets, cost_items, virtual_components,
cost_rules, rule_conditions, rule_actions, rule_exceptions,
manual_cost_adjustments,
sites, warehouses, projects,
inventory_snapshots, inventory_lines
```

The trigger captures:
- `old_values`: full row as JSONB before mutation (UPDATE and DELETE)
- `new_values`: full row as JSONB after mutation (INSERT and UPDATE)
- `change_delta`: only the keys whose values changed (UPDATE only)
- `performed_by`: resolved from `auth.uid()` in the active session
- `performed_at`: server-side `now()`

## Workflow Events

Workflow events are written by the application layer (not the trigger), in addition to the data mutation trigger. They capture the business interpretation of the change:

| Event Type | Written When | reference_id |
|-----------|-------------|-------------|
| `bom_approved` | `bom_versions.status` → `approved` | bom_version.id |
| `bom_superseded` | `bom_versions.status` → `superseded` | bom_version.id |
| `snapshot_approved` | `inventory_snapshots.status` → `approved` | snapshot.id |
| `rule_activated` | `cost_rules.is_active` → `true` | cost_rule.id |
| `rule_deactivated` | `cost_rules.is_active` → `false` | cost_rule.id |
| `exception_approved` | `rule_exceptions.status` → `approved` | exception.id |
| `exception_rejected` | `rule_exceptions.status` → `rejected` | exception.id |
| `calculation_executed` | Cost engine completes a run | calculation_trace.id |
| `valuation_executed` | Inventory valuation computed | snapshot.id |
| `user_invited` | New profile created | profile.id |
| `user_role_changed` | `profiles.role` changes | profile.id |
| `user_deactivated` | `profiles.is_active` → `false` | profile.id |
| `cost_set_locked` | `cost_sets.is_locked` → `true` | cost_set.id |
| `adjustment_approved` | `manual_cost_adjustments.status` → `approved` | adjustment.id |

## Immutability Enforcement

The `audit_log` table has no `updated_at` column. RLS policies enforce:
- `SELECT`: permitted for `admin` role (and above); `cost_analyst` and above can query their organization's log
- `INSERT`: permitted only via service role (the trigger runs as service role)
- `UPDATE`: blocked for all roles including `admin` — `WITH CHECK (false)`
- `DELETE`: blocked for all roles including `admin` — `WITH CHECK (false)`

This means even an admin user cannot modify or delete audit records through the application. Modification would require direct database access with the service role key, which is logged at the infrastructure level.

## Retention

| Category | Minimum Retention | Rationale |
|---------|-------------------|-----------|
| All audit_log rows | 7 years from created_at | EU MDR / medical device regulatory requirement |
| calculation_traces | Platform lifetime | Explainability requirement |
| inventory_snapshots (approved) | 10 years | Financial record retention |
| validation_findings | 3 years | Data quality history |

---

# 12. Row Level Security Intent

## Overview

All tenant-owned tables carry `organization_id`. RLS policies use `auth.uid()` to look up the user's profile and compare `profiles.organization_id` to the row's `organization_id`. This ensures no cross-organization data leakage.

The RLS policies described here are **intent specifications** — they define the access rules that SQL policies must implement. The actual `CREATE POLICY` statements are authored separately during migration planning.

## Policy Pattern

Every table uses this base SELECT policy:

```
ALLOW SELECT WHERE organization_id = (
  SELECT organization_id FROM profiles WHERE id = auth.uid()
)
```

Write policies add role checks on top of this base.

## Per-Table RLS Intent

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `organizations` | Own org only | Super-admin only | Super-admin only | Never |
| `profiles` | Own org only | admin only | admin (any profile in org), or self (own row, limited fields) | Never (deactivate only) |
| `families` | Own org | editor, cost_analyst, admin | editor, cost_analyst, admin | Never (is_active = false) |
| `subfamilies` | Own org | editor, cost_analyst, admin | editor, cost_analyst, admin | Never |
| `skus` | Own org | editor, cost_analyst, admin | editor, cost_analyst, admin | Never (status = archived) |
| `suppliers` | Own org | procurement, admin | procurement, admin | Never |
| `supplier_prices` | Own org | procurement, admin | procurement, admin (existing rows only; history preserved) | Never |
| `boms` | Own org | editor, admin | editor, admin | Never |
| `bom_versions` | Own org | editor, admin | editor, admin (draft only); approver (status field only) | Never |
| `bom_lines` | Own org | editor, admin (when bom_version is draft) | editor, admin (when bom_version is draft) | editor, admin (when draft) |
| `cost_sets` | Own org | cost_analyst, admin | cost_analyst, admin (unlocked only) | Never |
| `cost_items` | Own org | cost_analyst, admin (unlocked cost_set) | cost_analyst, admin (unlocked) | Never |
| `virtual_components` | Own org | cost_analyst, admin | cost_analyst, admin | Never |
| `cost_rules` | Own org | cost_analyst, admin | cost_analyst, admin | Never |
| `rule_conditions` | Own org | cost_analyst, admin (inactive rule only) | Never (immutable when rule active) | Never |
| `rule_actions` | Own org | cost_analyst, admin (inactive rule only) | Never (immutable when rule active) | Never |
| `rule_exceptions` | Own org | cost_analyst, admin (INSERT = create request) | approver, admin (status field only) | Never |
| `manual_cost_adjustments` | Own org | cost_analyst, admin (INSERT = create request) | approver, admin (status field only) | Never |
| `sites` | Own org | admin | admin | Never |
| `warehouses` | Own org | admin | admin | Never |
| `projects` | Own org | editor, admin | editor, admin | Never |
| `inventory_snapshots` | Own org | editor, admin | editor, admin (draft only); approver (status field only) | Never |
| `inventory_lines` | Own org | editor, admin (draft snapshot only) | editor, admin (draft snapshot only) | editor, admin (draft snapshot only) |
| `inventory_valuation_results` | Own org | System/service role only | Never | Never |
| `calculation_traces` | Own org | Service role (engine) only | Service role (engine, is_complete update only) | Never |
| `calculation_trace_lines` | Own org | Service role only | Never | Never |
| `rule_execution_traces` | Own org | Service role only | Never | Never |
| `exception_execution_traces` | Own org | Service role only | Never | Never |
| `cost_source_traces` | Own org | Service role only | Never | Never |
| `validation_runs` | Own org | Service role + authenticated users (triggering validation) | Service role only | Never |
| `validation_findings` | Own org | Service role only | cost_analyst, editor (status field: acknowledge/resolve) | Never |
| `audit_log` | admin, cost_analyst (own org) | Service role (trigger) only | Never (RLS blocks) | Never (RLS blocks) |

## Key RLS Notes

- **"Service role only"** means the operation is performed by the backend using the Supabase `service_role` key, which bypasses RLS. The service role key is never exposed to the browser.
- **"Never delete"** means all deletion is implemented as soft-delete via status changes (`is_active = false`, `status = 'archived'`). Hard DELETE is not permitted for any business table.
- **`bom_lines` write rules** depend on the parent `bom_versions.is_locked`. The RLS policy must join through `bom_versions` to check the lock state.
- **`rule_conditions` and `rule_actions`** are immutable once the parent `cost_rules.is_active = true`. The RLS policy must join through `cost_rules` to check `is_active`.

---

# 13. Indexing Strategy

Indexes are defined conceptually. The exact `CREATE INDEX` statements are produced during migration authoring. All indexes listed here are non-unique unless noted.

## Mandatory Indexes (every tenant-owned table)

| Index | Purpose |
|-------|---------|
| `(organization_id)` on every tenant-owned table | RLS policy evaluation; every query filters by org |

## Product Master

| Table | Index Columns | Purpose |
|-------|--------------|---------|
| `skus` | `(organization_id, part_number)` UNIQUE | SKU lookup by part number |
| `skus` | `(organization_id, family_id)` | Filter by family |
| `skus` | `(organization_id, subfamily_id)` | Filter by subfamily |
| `skus` | `(organization_id, status)` | Filter active SKUs |
| `skus` | `(organization_id, item_type, make_buy)` | Filter by manufacturing type |
| `supplier_prices` | `(sku_id, supplier_id, effective_from)` | Active price lookup (most frequent query) |
| `supplier_prices` | `(sku_id, effective_from, effective_to)` | Price history for a SKU |
| `supplier_prices` | `(organization_id, supplier_id)` | All prices from a supplier |

## BOM

| Table | Index Columns | Purpose |
|-------|--------------|---------|
| `boms` | `(sku_id)` UNIQUE | Find BOM for a SKU |
| `bom_versions` | `(bom_id, status)` | Find approved/draft versions |
| `bom_versions` | `(bom_id, version_number)` UNIQUE | Version lookup |
| `bom_lines` | `(bom_version_id)` | All lines for a BOM version |
| `bom_lines` | `(parent_line_id)` | Tree traversal (find children) |
| `bom_lines` | `(sku_id)` | Find all BOMs using a SKU |
| `bom_lines` | `(bom_version_id, parent_line_id, position)` | Ordered children for display |

## Costing

| Table | Index Columns | Purpose |
|-------|--------------|---------|
| `cost_sets` | `(organization_id, status, effective_from, effective_to)` | Find active cost sets |
| `cost_items` | `(cost_set_id, scope_type, scope_id)` | Cost resolution lookup (hot path) |
| `cost_items` | `(cost_set_id, item_type, effective_from)` | Filter by item type and date |
| `cost_rules` | `(organization_id, is_active, priority)` | Load active rules in priority order |
| `cost_rules` | `(organization_id, cost_set_scope_id)` | Rules scoped to a cost set |
| `rule_conditions` | `(cost_rule_id)` | Conditions for a rule |
| `rule_actions` | `(cost_rule_id)` | Actions for a rule |
| `rule_exceptions` | `(cost_rule_id, status)` | Active exceptions per rule |
| `rule_exceptions` | `(exception_scope_type, exception_scope_id, status)` | Exceptions for a scope entity |

## Context & Inventory

| Table | Index Columns | Purpose |
|-------|--------------|---------|
| `warehouses` | `(site_id)` | All warehouses in a site |
| `inventory_snapshots` | `(organization_id, snapshot_date, status)` | Find approved snapshots by date |
| `inventory_snapshots` | `(organization_id, scope_warehouse_id, status)` | Find snapshots for a warehouse |
| `inventory_lines` | `(snapshot_id, sku_id, warehouse_id)` UNIQUE | Unique line lookup |
| `inventory_lines` | `(snapshot_id, has_missing_cost)` | Find missing cost lines |
| `inventory_lines` | `(sku_id)` | All snapshot history for a SKU |

## Explainability

| Table | Index Columns | Purpose |
|-------|--------------|---------|
| `calculation_traces` | `(organization_id, sku_id, triggered_at DESC)` | Trace history for a SKU |
| `calculation_traces` | `(organization_id, cost_set_id, valuation_date)` | Traces by context |
| `calculation_trace_lines` | `(trace_id, parent_line_id, position)` | Tree traversal for a trace |
| `calculation_trace_lines` | `(trace_id, depth)` | Level-by-level traversal |
| `rule_execution_traces` | `(trace_id, trace_line_id)` | Rules for a trace line |
| `rule_execution_traces` | `(cost_rule_id, was_applied)` | Rule effectiveness analysis |
| `cost_source_traces` | `(trace_id, trace_line_id)` | Sources for a trace line |
| `cost_source_traces` | `(trace_id, was_selected)` | Selected source per line |

## Validation & Audit

| Table | Index Columns | Purpose |
|-------|--------------|---------|
| `validation_runs` | `(organization_id, scope_type, scope_id, triggered_at DESC)` | Recent runs for an entity |
| `validation_findings` | `(validation_run_id, severity, status)` | Filter findings |
| `validation_findings` | `(entity_type, entity_id)` | All findings for a specific record |
| `validation_findings` | `(organization_id, severity, status)` | Open errors across org |
| `audit_log` | `(organization_id, performed_at DESC)` | Recent audit events |
| `audit_log` | `(table_name, record_id, performed_at DESC)` | Audit history for a specific row |
| `audit_log` | `(performed_by, performed_at DESC)` | Audit history for a user |
| `audit_log` | `(event_type, performed_at DESC)` | Filter by event type |

## Partial Indexes (critical)

| Table | Partial Condition | Indexed Columns | Purpose |
|-------|------------------|----------------|---------|
| `bom_versions` | `WHERE status = 'approved'` | `(bom_id)` UNIQUE | Enforce one approved version per BOM |
| `skus` | `WHERE status = 'active'` | `(organization_id, family_id)` | Fast active-SKU queries |
| `cost_rules` | `WHERE is_active = true` | `(organization_id, priority)` | Load only active rules in priority order |
| `rule_exceptions` | `WHERE status = 'active'` | `(cost_rule_id, exception_scope_id)` | Active exceptions lookup |
| `supplier_prices` | `WHERE effective_to IS NULL` | `(sku_id, supplier_id)` | Find current (open-ended) prices |

---

# 14. Out-of-Scope for Initial Schema

These entities and capabilities are architecturally designed (see BLUEPRINT.md) but excluded from the initial migration to keep the MVP focused. They must be designed now to ensure the initial schema can accommodate them without breaking changes.

| Item | Why Excluded | Schema Impact Considered |
|------|-------------|------------------------|
| `exchange_rates` table | Multi-currency support is Phase 2; all MVP Cost Items are in base currency | Cost Items have `currency` column now; exchange rate table adds alongside without migration |
| ERP integration tables | Phase 3+ | `skus.part_number` format is already ERP-compatible |
| `eco_orders` (Engineering Change Orders) | Phase 3 | BOM versioning already supports ECO flow semantically |
| Email notification log | Phase 3 | No schema dependency; delivered via Supabase Edge Function |
| `price_lists` (customer-facing) | Future | Architecturally separate from costing |
| AI anomaly detection | Future | Reads from existing tables; no schema changes needed |
| `audit_log` cold storage migration | Year 3+ | retention policy documented; migration can be scripted from existing schema |
| `inventory_lines` import from ERP | Phase 3 | Quantity entry schema is identical; only the input mechanism changes |

**Accommodation rules for future additions:**
- Multi-currency: add `exchange_rates (organization_id, from_currency, to_currency, rate, effective_from, effective_to)` table; add `exchange_rate_id` FK to relevant cost engine outputs. No changes to `cost_items` or `cost_sets`.
- ECO workflow: add `eco_orders` table with FK to `bom_versions`; `bom_versions.change_summary` already carries the narrative.
- Advanced rule conditions: `rule_conditions.condition_field` is text; new field paths can be added to the engine without schema migration.
- New cost item types: `cost_items.item_type` is a text CHECK constraint; adding a new type requires a migration to extend the CHECK — acceptable.

---

# 15. Open Questions

These questions require business owner decision before migration authoring. Do not make hidden assumptions; hold here for resolution.

| # | Question | Impact | Decision Needed By |
|---|---------|--------|-------------------|
| OQ-01 | **Currency handling in MVP:** Should Cost Items in MVP be restricted to `cost_sets.base_currency` only? Or should multi-currency be in schema from day one (with FX conversion deferred to Phase 2)? If restricted: add CHECK constraint. If open: add `exchange_rates` table now. | Schema constraint on `cost_items.currency` | Before Phase 1 migration |
| OQ-02 | **Duplicate BOM lines policy:** Are two lines with the same SKU under the same parent always a data error (hard block), or are there legitimate cases (same component in two reference positions at different quantities)? Current model: WARNING only. | V-BOM-003 severity; possible DB constraint | Before BOM module build |
| OQ-03 | **`rule_conditions` and `rule_actions` immutability when rule is active:** Should editing these be blocked by RLS (returning a DB error) or by application validation (returning a user-friendly message)? Both options are supportable; consistency with overall approach is the issue. | RLS policy design for `rule_conditions`, `rule_actions` | Before cost rule module build |
| OQ-04 | **Manual cost adjustment precedence:** Does a `manual_cost_adjustment` override Cost Set Items (making it the highest-precedence cost source, above Priority 1), or is it applied as an addition/modification after the Cost Set hierarchy resolves? | `manual_cost_adjustments` position in cost engine pipeline | Before cost engine build |
| OQ-05 | **Audit log consumer access:** Should `viewer` role be able to read `audit_log` for their organization, or is it admin/approver-only? Medical device regulations may require that any team member can produce their own audit trail on request. | RLS on `audit_log` for viewer role | Before auth module build |
| OQ-06 | **SKU soft-delete cascade:** When a SKU is archived, should the system automatically check and warn about all active BOM lines, supplier prices, and cost items referencing it? Or is this the user's responsibility to resolve first? | Validation rule scope; possible pre-archive check | Before SKU lifecycle implementation |
| OQ-07 | **`validation_findings` auto-resolve:** When the underlying issue is fixed (e.g., a missing cost is added), should open validation findings for that entity be auto-resolved by the next validation run, or must a user manually resolve them? | `validation_findings.status` lifecycle | Before validation engine build |
| OQ-08 | **BOM version effective dates:** `bom_versions.effective_from` and `effective_to` are currently informational. Should the cost engine enforce that only BOM versions where `effective_from <= valuation_date AND (effective_to IS NULL OR effective_to >= valuation_date)` are used — or should it always use the `approved` version regardless of date? | Cost engine BOM resolution logic | Before cost engine build |
| OQ-09 | **Project-level inventory:** A `project` is in scope in the data model. Does the MVP need project-scoped inventory, or is this confirmed Phase 2? If Phase 2: `inventory_snapshots.scope_project_id` can remain but the UI does not expose it. | MVP scope confirmation | Before MVP cut |
| OQ-10 | **`profiles.last_seen_at` update mechanism:** Should this be updated on every API request (high write volume), only on session creation, or not implemented in MVP? | Write frequency on `profiles`; potential RLS trigger issue | Before auth module build |

---

# 16. Implementation Readiness Checklist

| Requirement | Status |
|-------------|--------|
| ☑ All required business entities represented | **Complete** — 32 tables covering all 9 required entity groups |
| ☑ BOM recursion supported | **Complete** — `bom_lines.parent_line_id` self-reference with unlimited depth |
| ☑ Circular BOM detection supported | **Complete** — `bom_lines` schema enables ancestor traversal; Validation V-BOM-001 defined; enforcement mechanism documented |
| ☑ Cost Set model represented | **Complete** — `cost_sets` + `cost_items` with full scope hierarchy |
| ☑ Virtual Components represented | **Complete** — `virtual_components` table; `bom_lines.virtual_component_id` reference; cost resolution documented |
| ☑ Cost Rules represented | **Complete** — `cost_rules` + `rule_conditions` + `rule_actions` with priority, pipeline stage, and approval |
| ☑ Rule Exceptions represented | **Complete** — `rule_exceptions` with scope, type, justification, and approval workflow |
| ☑ Inventory Snapshot valuation represented | **Complete** — `inventory_snapshots` + `inventory_lines` + `inventory_valuation_results` with frozen costs and cost_set_snapshot |
| ☑ Explainability trace represented | **Complete** — 5-table trace model: traces, trace_lines, rule_execution_traces, exception_execution_traces, cost_source_traces |
| ☑ Validation findings represented | **Complete** — `validation_runs` + `validation_findings` with 24 named validation rules |
| ☑ Auditability represented | **Complete** — `audit_log` with trigger coverage, workflow events, immutability via RLS |
| ☑ RLS intent documented | **Complete** — per-table matrix for all roles; service-role pattern documented |
| ☑ Critical constraints documented | **Complete** — 20 named constraints; DB vs. App enforcement classified |
| ☑ Indexing strategy documented | **Complete** — all performance-critical queries covered; partial indexes for hot paths |
| ☑ Manual cost adjustments represented | **Complete** — `manual_cost_adjustments` with approval workflow |
| ☑ BOM immutability when approved | **Complete** — `bom_versions.is_locked`; constraint C-05 |
| ☑ Supplier domain represented | **Complete** — `suppliers` + `supplier_prices` with date ranges |
| ☑ Context entities represented | **Complete** — `sites`, `warehouses`, `projects` |
| ☑ Lifecycle states documented for every entity | **Complete** — lifecycle notes in every entity definition |
| ☐ Open questions resolved | **10 open questions** — require business owner decisions before migration authoring |
| ☐ Exchange rate table included | **Deferred** — OQ-01 must resolve whether to include in initial schema |

---

## Final Statement

**DATA_MODEL.md is ready for migration planning.**

The logical data model is complete, internally consistent, and directly traceable to the approved business specification in BLUEPRINT.md. All 32 entities are defined with fields, types, constraints, lifecycle rules, and RLS intent. All critical business rules are represented in schema terms. All 10 open questions are documented for business owner resolution.

A senior engineer can produce the PostgreSQL/Supabase migrations from this document without making any undocumented business assumptions, provided the 10 open questions are answered before the affected migrations are written.

**Recommended first migration set (order-dependent):**

```
001_create_enums_and_extensions
002_create_organizations
003_create_profiles
004_create_families_and_subfamilies
005_create_suppliers
006_create_skus
007_create_supplier_prices
008_create_boms_and_versions
009_create_bom_lines
010_create_virtual_components
011_create_cost_sets_and_items
012_create_cost_rules_conditions_actions_exceptions
013_create_manual_cost_adjustments
014_create_sites_warehouses_projects
015_create_inventory_tables
016_create_calculation_trace_tables
017_create_validation_tables
018_create_audit_log
019_create_rls_policies
020_create_audit_triggers
021_create_indexes
```

---

*DATA_MODEL.md v2.0 — Authoritative. Supersedes v1.0.*  
*Next artifact: Migration files (001 through 021), authored from this document.*
