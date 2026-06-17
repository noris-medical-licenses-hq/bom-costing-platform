# BOM Costing & Inventory Valuation Platform
# Definitive Implementation Blueprint

**Classification:** Authoritative Design Document  
**Version:** 1.0  
**Date:** 2026-06-17  
**Status:** Approved for Development  
**Author:** Chief Product Architect / Lead Solution Architect / Lead Data Architect

> This document is the single source of truth from which the database schema, backend  
> services, and MVP delivery plan are derived. A senior engineer reading this document  
> should be able to begin the database schema without making any business assumptions.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Business Capability Map](#2-business-capability-map)
3. [Business Domain Model](#3-business-domain-model)
4. [Costing Philosophy](#4-costing-philosophy)
5. [Cost Calculation Engine](#5-cost-calculation-engine)
6. [Explainability Architecture](#6-explainability-architecture)
7. [Validation Engine](#7-validation-engine)
8. [Inventory Valuation Architecture](#8-inventory-valuation-architecture)
9. [Rule Engine Architecture](#9-rule-engine-architecture)
10. [Audit Architecture](#10-audit-architecture)
11. [MVP Scope Definition](#11-mvp-scope-definition)
12. [Future Roadmap](#12-future-roadmap)
13. [Risk Register](#13-risk-register)
14. [Architectural Decisions](#14-architectural-decisions)
15. [Recommended Next Development Step](#15-recommended-next-development-step)

---

# 1. Executive Summary

## What this platform is

The BOM Costing & Inventory Valuation Platform is an internal web application that enables Noris Medical engineering, procurement, finance, and operations teams to:

1. **Define and version Bills of Materials** for manufactured medical devices
2. **Calculate the cost of any SKU** using a deterministic, explainable, auditable engine
3. **Value inventory** at any point in time against any cost standard
4. **Enforce and trace business cost rules** across all costing contexts
5. **Produce audit-ready cost reports** for regulatory submissions, pricing decisions, and supplier negotiations

## The two domains

The platform contains two co-equal domains that share a common data foundation:

```
┌─────────────────────────────────────────────────────┐
│          BOM COSTING DOMAIN                         │
│  SKU → BOM → Components → Cost Engine → Cost        │
│  Cost Sets · Cost Rules · Virtual Components        │
│  Explainability · Validation                        │
├─────────────────────────────────────────────────────┤
│          INVENTORY VALUATION DOMAIN                 │
│  SKU × Quantity × Site/Warehouse × Cost Set         │
│  Snapshot → Valuation → Historical Reproducibility  │
│  Audit · Reporting                                  │
└─────────────────────────────────────────────────────┘
         Shared: SKU master · Cost Sets · Audit · Rules
```

## Core design principles

**Explainability First.** Every cost figure the platform produces must be navigable to its source. "Why does this SKU cost €42.17?" must always have a traceable answer.

**Auditability by Default.** Every mutation, calculation execution, and rule application is logged immutably. The platform must be able to answer regulatory audit questions years after the fact.

**Cost Determinism.** Given the same inputs and the same date, the platform must always produce the same cost. Historical calculations must be reproducible indefinitely.

**Business Correctness over Technical Cleverness.** The domain model follows manufacturing industry semantics. The platform's job is to compute the right answer, not to be technically elegant.

**Minimal Breaking Changes.** The schema is designed to absorb new requirements (new cost item types, new rule conditions, new valuation contexts) without migration-driven rewrites.

---

# 2. Business Capability Map

```
BOM COSTING & INVENTORY VALUATION PLATFORM
│
├── ITEM MANAGEMENT
│   ├── SKU Registry (part master)
│   ├── SKU Classification (Family / SubFamily)
│   ├── Virtual Component Library
│   └── Supplier Registry
│
├── BOM MANAGEMENT
│   ├── BOM Authoring (multi-level, recursive)
│   ├── BOM Versioning (draft → approved → archived)
│   ├── BOM Validation (structural + business)
│   └── BOM History & Diff
│
├── COST MANAGEMENT
│   ├── Supplier Price Catalog (date-ranged, multi-currency)
│   ├── Cost Set Management (named cost contexts)
│   ├── Cost Item Management (within cost sets)
│   ├── Cost Rule Engine
│   └── Rule Exception Management
│
├── COST CALCULATION
│   ├── BOM Cost Roll-up Engine
│   ├── Calculation Trace (Explainability)
│   ├── Scenario Comparison
│   └── Cost Export (PDF / CSV)
│
├── INVENTORY VALUATION
│   ├── Inventory Snapshot
│   ├── Snapshot Valuation (against Cost Set)
│   ├── Historical Valuation Replay
│   └── Valuation Report
│
├── VALIDATION
│   ├── Structural Validation (BOM cycles, orphans)
│   ├── Business Validation (missing costs, invalid rules)
│   └── Inventory Validation
│
└── ADMINISTRATION
    ├── User & Role Management
    ├── Organization Settings
    ├── Audit Log Viewer
    └── Approval Workflows
```

---

# 3. Business Domain Model

## 3.1 Tenant Domain

### Organization
**Purpose:** The root multi-tenant entity. All business data is owned by and scoped to an Organization.  
**Business owner:** Admin  
**Lifecycle:** Created by platform admin; no deletion (soft-archive only)  
**Key attributes:** name, default_currency, default_cost_set_id, created_at  
**Relationships:** Owns all other entities  
**Validation rules:**
- Default currency must be a valid ISO 4217 code
- Default cost set must belong to this organization

---

### User
**Purpose:** An authenticated human who interacts with the platform.  
**Business owner:** Admin  
**Lifecycle:** Invited → Active → Deactivated  
**Key attributes:** email, full_name, organization_id, role  
**Identity:** Managed by Supabase Auth (`auth.users`). Extended by the `profiles` table.  
**Relationships:** Belongs to one Organization; has one Role  
**Validation rules:**
- A user can belong to exactly one organization (no cross-org users)
- A deactivated user's historical records must remain intact (no deletion)

---

### Role
**Purpose:** Defines what a user can read and write within the platform.  
**Business owner:** Admin  
**This is an enum, not a table.** Roles are:

| Role | Capabilities |
|------|-------------|
| `viewer` | Read all data; no mutations |
| `editor` | Create and edit SKUs, BOMs, components |
| `cost_analyst` | All editor rights + manage cost sets, cost items, cost rules |
| `procurement` | All editor rights + manage suppliers, supplier prices |
| `approver` | All editor rights + approve BOMs and inventory snapshots |
| `admin` | Full access including user management and organization settings |

**Design note:** Roles are additive in read permissions but cumulative in write. A `cost_analyst` cannot approve BOMs — that requires `approver`. A user who needs both should be assigned `admin`.

---

## 3.2 Item Domain

The platform uses a **unified item model**. An "item" is any entity that appears in a BOM or in inventory. This eliminates the ambiguity between "product," "component," and "part" that exists in the current model.

### SKU (Stock Keeping Unit)
**Purpose:** The universal item entity. Represents any distinct article that can be costed, stocked, or manufactured — whether it is a purchased raw material, a manufactured sub-assembly, or a finished sellable device.  
**Business owner:** Engineering (structure) / Procurement (purchased items) / Admin (lifecycle)  
**Lifecycle:** Draft → Active → Discontinued → Archived  
**Key attributes:**

| Attribute | Description |
|-----------|-------------|
| part_number | Unique identifier within the organization |
| name | Human-readable name |
| description | Detailed description |
| item_type | `purchased_part`, `sub_assembly`, `finished_good`, `service`, `virtual` |
| make_buy | `make`, `buy`, `make_or_buy` |
| unit_of_measure | pcs, kg, m, L, hr, etc. |
| family_id | FK → Family |
| sub_family_id | FK → SubFamily |
| lead_time_days | Procurement lead time |
| is_regulated | Whether this item requires regulatory qualification |
| default_supplier_id | Preferred supplier for procurement |
| status | draft, active, discontinued, archived |
| created_by, created_at | Provenance |
| updated_by, updated_at | Change tracking |

**Relationships:**
- Belongs to Organization
- Belongs to Family → SubFamily (classification)
- Has zero or one active BOM (if `make` or `make_or_buy`)
- Has many SupplierPrices (if `buy` or `make_or_buy`)
- Can appear as a BOM Line in other SKUs' BOMs (as sub-assembly)
- Can appear in Inventory Lines

**Validation rules:**
- `part_number` must be unique within organization
- If `item_type = finished_good` or `sub_assembly`, a BOM must be available before costing
- If `item_type = purchased_part`, at least one active SupplierPrice should exist (warning, not error)
- If `make_buy = buy`, it must not have a BOM (structural validation)
- A discontinued SKU cannot receive new SupplierPrices

**Why this replaces separate Product and Component tables:**  
In manufacturing, the same part number can be purchased (bought externally) or manufactured (made internally) depending on capacity. Using a single SKU entity with `make_buy` captures this reality. A PCB assembly (sub_assembly) and a resistor (purchased_part) are both SKUs. The distinction is their `item_type` and `make_buy` flag, not their table.

---

### Family
**Purpose:** The top level of SKU classification. Drives cost rule assignment and reporting grouping.  
**Example:** Electronic Components, Mechanical Parts, Packaging, Regulatory Items  
**Business owner:** Admin / Cost Analyst  
**Lifecycle:** Created by admin; rarely deleted (only if no SKUs assigned)  
**Key attributes:** code, name, description, organization_id  
**Relationships:** Has many SubFamilies; has many SKUs

---

### SubFamily
**Purpose:** Second level of SKU classification, under a Family.  
**Example:** PCBs (under Electronic Components), Screws (under Mechanical Parts)  
**Business owner:** Admin / Cost Analyst  
**Lifecycle:** Follows Family  
**Key attributes:** code, name, description, family_id  
**Relationships:** Belongs to Family; has many SKUs  
**Validation rules:** Code must be unique within a Family

---

### Virtual Component
**Purpose:** A cost element that contributes to BOM cost but does not correspond to a physical item in inventory. Virtual components represent overhead allocations, regulatory fees, tooling amortizations, packaging, yield losses, or any cost that is real but has no part number.  
**Business owner:** Cost Analyst  
**Lifecycle:** Active → Inactive  
**Key attributes:**

| Attribute | Description |
|-----------|-------------|
| name | Descriptive name (e.g., "ISO 13485 Certification Amortization") |
| description | Business justification |
| cost_type | `fixed_per_unit`, `percentage_of_material`, `percentage_of_total` |
| calculation_basis | What the percentage applies to (material_subtotal, bom_total, labor_total) |
| organization_id | Owner |
| status | active, inactive |

**Relationships:**
- Belongs to Organization
- Can appear as BOM Lines in any BOM
- Has CostItems within CostSets (to assign its unit cost or rate)

**Why Virtual Components are required:**  
Without virtual components, cost analysts are forced to either embed these costs in component prices (hiding them, making them non-auditable) or ignore them (producing understated costs). Both options violate the Explainability First principle. A virtual component makes these real costs visible, traceable, and reportable as distinct line items.

**Example:** A BOM for a medical device might include:
- 1x PCB Assembly — €18.40 (physical component)
- 1x Housing — €4.20 (physical component)
- 1x Packaging (virtual) — €0.85 (percentage of material)
- 1x CE Marking Amortization (virtual) — €1.20 (fixed per unit, €240k / 200k units)
- 1x Scrap Factor (virtual) — €0.46 (2% of material subtotal)

Without virtual components, the true cost would be €18.40 + €4.20 = €22.60. With virtual components, the true cost is €25.11 — a 12% understatement avoided.

---

## 3.3 Supplier Domain

### Supplier
**Purpose:** A vendor from whom the organization purchases SKUs.  
**Business owner:** Procurement  
**Lifecycle:** Active → Inactive → Disqualified  
**Key attributes:** name, code, country (ISO 3166-1), contact_email, is_qualified, qualification_date, organization_id  
**Validation rules:**
- A disqualified supplier's historical prices must be retained
- A SKU cannot be actively sourced from a disqualified supplier (warning)

---

### SupplierPrice
**Purpose:** The time-ranged unit price for a specific SKU from a specific supplier.  
**Business owner:** Procurement  
**Lifecycle:** Created with effective dates; superseded by newer price (not deleted)  
**Key attributes:**

| Attribute | Description |
|-----------|-------------|
| sku_id | FK → SKU |
| supplier_id | FK → Supplier |
| unit_price | Price in declared currency |
| currency | ISO 4217 |
| moq | Minimum order quantity |
| price_break_qty | Optional: quantity at which this price applies |
| effective_from | Date from which this price is valid |
| effective_to | Date to which valid (null = current) |
| is_quoted | Whether this is a formal quote |
| quote_reference | Quote document reference |
| created_by, created_at | Provenance |

**Relationships:** Belongs to SKU; belongs to Supplier  
**Validation rules:**
- For the same SKU + Supplier combination, date ranges must not overlap (enforced by constraint)
- `effective_from` must be ≤ `effective_to` if `effective_to` is set
- `unit_price` must be > 0
- Currency must be a valid ISO 4217 code

**Active price resolution rule:** The active price for a given date is the SupplierPrice where `effective_from ≤ target_date AND (effective_to IS NULL OR effective_to ≥ target_date)`. If multiple rows match (overlap violation), this is a data error that the validation engine must surface.

---

## 3.4 BOM Domain

### BOM
**Purpose:** Defines what a SKU is made of. A BOM is the recipe for manufacturing a SKU.  
**Business owner:** Engineering  
**Lifecycle:** A BOM belongs to a SKU. Only SKUs with `make_buy IN ('make', 'make_or_buy')` have BOMs.  
**Key attributes:** sku_id, status (draft, active, archived), created_by, created_at  
**Relationships:** Belongs to SKU; has many BOM Versions

**Design decision:** The BOM entity is a container for versions. The BOM itself has no cost data — cost is always resolved against a BOM Version.

---

### BOM Version
**Purpose:** An immutable, point-in-time snapshot of a BOM's structure.  
**Business owner:** Engineering (authoring); Approver (approval)  
**Lifecycle:** Draft → Under Review → Approved → Superseded → Archived

| Status | Meaning |
|--------|---------|
| `draft` | Being edited; not used for costing |
| `under_review` | Submitted for approval; locked for editing |
| `approved` | Current production version; used for costing and inventory valuation |
| `superseded` | Was approved; replaced by a newer approved version |
| `archived` | Retired; historical reference only |

**Key attributes:**

| Attribute | Description |
|-----------|-------------|
| bom_id | FK → BOM |
| version_number | Integer, auto-incremented per BOM |
| version_label | Human label ("Rev A", "Production 2026-Q2") |
| status | Lifecycle status |
| effective_from | When this version became/becomes production |
| effective_to | When superseded (null = current) |
| approved_by | FK → Profile |
| approved_at | Timestamp of approval |
| change_summary | Human description of what changed |
| created_by, created_at | Provenance |

**Constraints:**
- Exactly one BOM Version per BOM can be in `approved` status at any time (enforced by partial unique index: WHERE status = 'approved')
- An `approved` version cannot be edited — a new version must be created
- Version numbers are assigned sequentially; never reassigned

---

### BOM Line
**Purpose:** A single entry in a BOM Version's structure. Each line represents one ingredient in the manufacturing recipe.  
**Business owner:** Engineering  
**Key attributes:**

| Attribute | Description |
|-----------|-------------|
| bom_version_id | FK → BOM Version |
| parent_line_id | FK → BOM Line (self, nullable; null = root level) |
| line_type | `sku`, `virtual_component` |
| sku_id | FK → SKU (when line_type = 'sku') |
| virtual_component_id | FK → Virtual Component (when line_type = 'virtual_component') |
| quantity | Amount required |
| unit_of_measure | Must match referenced SKU's UOM |
| position | Display order within parent |
| is_reference | If true: informational only, not costed |
| notes | Engineering notes |

**Constraints:**
- Exactly one of `sku_id` or `virtual_component_id` must be non-null (enforced by CHECK constraint)
- `quantity` must be > 0
- A BOM Line referencing a SKU that also has a BOM creates a sub-assembly relationship (cost engine recurses)
- A BOM Line must not create a cycle (see Validation Engine, V-001)
- A BOM Line referencing a `virtual` item_type SKU is invalid — use `virtual_component_id` instead

**Cycle prevention strategy:** Cycles are detected at write time by the validation engine (not by a database constraint). Before inserting or updating a BOM Line, the engine traverses the proposed path upward to the root; if the candidate SKU appears in any ancestor, the write is rejected with a `CIRCULAR_REFERENCE` error.

---

## 3.5 Costing Domain

### Cost Set
**Purpose:** A named, reusable collection of cost parameters that defines a costing context. A Cost Set is the answer to the question: "Under what cost assumptions should this BOM be valued?"  
**Business owner:** Cost Analyst  
**Lifecycle:** Draft → Active → Archived  
**Key attributes:**

| Attribute | Description |
|-----------|-------------|
| name | Human name ("Standard 2026", "Brazil Tariff Q1-2026", "Budget Scenario") |
| description | Business purpose |
| base_currency | All costs normalized to this currency |
| effective_from | Validity start date |
| effective_to | Validity end date (null = current) |
| cost_set_type | `standard`, `budget`, `quote`, `actual`, `simulation` |
| is_locked | When true: no new CostItems can be added (used for historical snapshots) |
| organization_id | Owner |
| created_by, created_at | Provenance |

**Relationships:** Has many Cost Items; can be assigned to many SKU/BOM costing contexts; referenced by Inventory Snapshots

**Why Cost Sets replace Cost Scenarios:**  
The previous model had `cost_scenarios` as a per-BOM construct. Cost Sets are organization-wide reusable contexts. The same "Standard 2026" cost set can be applied to every BOM in the organization without duplicating the overhead percentages, labor rates, and freight rules. A scenario comparison then becomes: "Cost this BOM under Cost Set A vs Cost Set B."

---

### Cost Item
**Purpose:** A single cost parameter within a Cost Set. A Cost Item defines a cost value, how it applies (fixed, percentage, rate), and to what it applies (all, a category, a specific SKU).  
**Business owner:** Cost Analyst  
**Key attributes:**

| Attribute | Description |
|-----------|-------------|
| cost_set_id | FK → Cost Set |
| item_type | `material_price`, `labor_rate`, `overhead_pct`, `freight_pct`, `duty_rate`, `tooling_fixed`, `custom` |
| scope_type | `global`, `family`, `sub_family`, `sku`, `supplier`, `supplier_country` |
| scope_id | ID of the scoped entity (null for global) |
| value | Numeric value |
| value_unit | `currency`, `percentage`, `rate_per_hour`, `rate_per_unit` |
| currency | ISO 4217 (when value_unit = currency) |
| applies_to | `material_subtotal`, `labor_subtotal`, `bom_total`, `per_unit` |
| effective_from | Validity start |
| effective_to | Validity end (null = current within cost set validity) |
| notes | Business justification |
| created_by, created_at | Provenance |

**Scope resolution (most specific wins):**  
When multiple Cost Items in the same Cost Set could apply to a given SKU:
1. SKU-specific Cost Item wins
2. SubFamily-specific wins over Family-specific
3. Family-specific wins over Supplier-specific
4. Supplier-specific wins over SupplierCountry-specific
5. SupplierCountry-specific wins over Global
6. Global is the fallback

**Examples:**
- Global overhead: item_type=overhead_pct, scope_type=global, value=12.0 (%)
- Labor rate: item_type=labor_rate, scope_type=global, value=45.00 (€/hr)
- Import duty for Chinese suppliers: item_type=duty_rate, scope_type=supplier_country, scope_id='CN', value=8.0 (%)
- Override price for SKU-001: item_type=material_price, scope_type=sku, scope_id=<sku_id>, value=14.50 (€)

---

### Cost Rule
**Purpose:** A business rule that modifies cost calculation behavior across all applicable contexts. Cost Rules express business policies that apply universally unless explicitly excepted.  
**Business owner:** Cost Analyst / Finance  
**Lifecycle:** Draft → Active → Inactive  
**Key attributes:**

| Attribute | Description |
|-----------|-------------|
| name | Human name ("China Import Duty 2026") |
| description | Business justification |
| rule_type | `add_percentage`, `add_fixed`, `multiply`, `replace_cost`, `exclude_from_rollup`, `cap_at_value` |
| condition_field | What the rule conditions on (sku.family_id, sku.item_type, supplier.country, etc.) |
| condition_operator | `equals`, `not_equals`, `in`, `not_in`, `greater_than`, `less_than` |
| condition_value | The value to compare against |
| action_value | The value applied by the rule |
| action_basis | What the action applies to (material_cost, bom_total, specific_cost_item_type) |
| priority | Integer; lower = higher priority; evaluated in ascending order |
| cost_set_scope | If set: only applies when this cost set is active |
| is_active | Boolean |
| effective_from | Date-ranged applicability |
| effective_to | |
| created_by, created_at | Provenance |

**See Section 9 (Rule Engine Architecture) for full rule execution semantics.**

---

### Rule Exception
**Purpose:** An approved override that prevents a specific Cost Rule from applying to a specific SKU, BOM Version, or context. Rule Exceptions represent known, justified departures from standard cost policy.  
**Business owner:** Cost Analyst (creates) → Approver (approves)  
**Lifecycle:** Requested → Approved → Active → Expired  
**Key attributes:**

| Attribute | Description |
|-----------|-------------|
| cost_rule_id | FK → Cost Rule |
| exception_scope_type | `sku`, `bom_version`, `family`, `supplier` |
| exception_scope_id | ID of the scoped entity |
| exception_type | `skip_rule`, `override_value`, `override_basis` |
| override_value | When exception_type = override_value |
| business_justification | Required — why this exception is valid |
| approved_by | FK → Profile |
| approved_at | Timestamp |
| effective_from | |
| effective_to | (null = indefinite) |
| created_by, created_at | Provenance |

**Validation rules:**
- Every Rule Exception requires a non-empty `business_justification`
- Every Rule Exception requires approval from an `approver` or `admin` role
- Expired exceptions are retained for audit; never deleted

---

## 3.6 Location Domain

### Site
**Purpose:** A physical or logical manufacturing/storage location owned by the organization.  
**Example:** Frankfurt Plant, Lisbon Warehouse, Singapore Distribution  
**Key attributes:** code, name, address, country, organization_id, is_active  
**Relationships:** Has many Warehouses

---

### Warehouse
**Purpose:** A storage zone within a Site.  
**Example:** Raw Materials Store, Finished Goods, WIP  
**Key attributes:** code, name, site_id, warehouse_type (raw, wip, finished, quarantine), is_active  
**Relationships:** Belongs to Site; contains Inventory Lines

---

### Project
**Purpose:** A logical cost center or project to which inventory and costs can be attributed. Allows inventory valuation for a specific project's stock independently of the main warehouse.  
**Key attributes:** code, name, description, organization_id, status (active, closed)  
**Relationships:** Belongs to Organization; referenced by Inventory Snapshots

---

## 3.7 Inventory Domain

*(Full architecture in Section 8)*

### Inventory Snapshot
**Purpose:** An immutable point-in-time record of physical inventory quantities across one or more warehouses, for a specific date, valued against a specific Cost Set.  
**Key attributes:** snapshot_date, site_id (optional), warehouse_id (optional), project_id (optional), cost_set_id, status, created_by, created_at  
**Lifecycle:** Draft → Approved → Immutable

---

### Inventory Line
**Purpose:** A single line within an Inventory Snapshot: one SKU at one location with its quantity and computed value.  
**Key attributes:** snapshot_id, sku_id, warehouse_id, quantity, unit_cost (frozen), total_value (frozen), cost_source, trace_id

---

## 3.8 Observability Domain

### Calculation Trace
**Purpose:** An immutable, structured record of every decision made during a cost calculation. The Calculation Trace is the foundation of the Explainability First principle.  
**See Section 6 for full design.**

---

### Audit Event
**Purpose:** An immutable record of every data mutation in the platform.  
**See Section 10 for full design.**

---

# 4. Costing Philosophy

## 4.1 Fundamental Principle

**The platform's authoritative cost is always the most specific, most intentional, most recently approved cost for a given context.**

"Context" means: a specific SKU, valued under a specific Cost Set, at a specific date.

The cost resolution process is deterministic. Given identical inputs, the engine always returns the same cost.

## 4.2 Cost Sources (in descending priority)

There are six possible sources of cost for any line item in a BOM. The engine evaluates them in this order and uses the first match:

| Priority | Source | Description | Who sets it |
|----------|--------|-------------|-------------|
| 1 | **Cost Set Item — SKU-specific** | A CostItem in the active Cost Set scoped to this exact SKU | Cost Analyst |
| 2 | **Cost Set Item — SubFamily** | A CostItem scoped to this SKU's SubFamily | Cost Analyst |
| 3 | **Cost Set Item — Family** | A CostItem scoped to this SKU's Family | Cost Analyst |
| 4 | **Cost Set Item — Supplier/Country** | A CostItem scoped to the default supplier or supplier country | Cost Analyst |
| 5 | **Cost Set Item — Global** | A global CostItem in the active Cost Set | Cost Analyst |
| 6 | **Supplier Price** | Active SupplierPrice from the supplier catalog for the valuation date | Procurement |
| — | **None found** | Cost = null; validation warning; line is costed at zero with a warning flag | — |

**Note:** BOM roll-up is not a "cost source" — it is the aggregation mechanism. A manufactured SKU's unit cost is the roll-up of its BOM lines' resolved costs.

## 4.3 Formal Cost Precedence Hierarchy

```
CONTEXT: SKU × Cost Set × Valuation Date

┌─────────────────────────────────────────────────────────┐
│  PRIORITY 1: Cost Set Item (SKU-specific)               │
│  Most specific. Explicit override for this exact SKU.   │
├─────────────────────────────────────────────────────────┤
│  PRIORITY 2: Cost Set Item (SubFamily)                  │
│  Category-level standard cost for this subfam group.    │
├─────────────────────────────────────────────────────────┤
│  PRIORITY 3: Cost Set Item (Family)                     │
│  Broader category standard.                             │
├─────────────────────────────────────────────────────────┤
│  PRIORITY 4: Cost Set Item (Supplier / Country)         │
│  Supplier-specific or country-specific cost standard.   │
├─────────────────────────────────────────────────────────┤
│  PRIORITY 5: Cost Set Item (Global)                     │
│  Organization-wide default (e.g., labor rate).          │
├─────────────────────────────────────────────────────────┤
│  PRIORITY 6: Supplier Price Catalog                     │
│  Live market price from procurement catalog.            │
├─────────────────────────────────────────────────────────┤
│  FALLBACK: No cost found                                │
│  Cost = null, flag as WARNING, do not block calc.       │
└─────────────────────────────────────────────────────────┘
         ↓ THEN: Apply Cost Rules (modify resolved cost)
         ↓ THEN: Apply Rule Exceptions (suppress/override rules)
         ↓ THEN: Apply Virtual Component costs
         ↓ THEN: Aggregate by BOM structure
         ↓ THEN: Apply Cost Set adjustments (overhead, labor)
```

## 4.4 Cost Precedence Decision Table

| Direct Cost in Cost Set? | BOM Exists? | Supplier Price Exists? | Rules Apply? | Exceptions? | Resolution |
|-------------------------|-------------|----------------------|-------------|-------------|-----------|
| Yes (SKU-scoped) | — | — | — | — | Use Cost Set Item (Priority 1) |
| Yes (Category) | — | — | — | — | Use Cost Set Item (Priority 2/3) |
| No | Yes (approved) | — | — | — | Roll up BOM, then resolve each leaf via priorities 4–6 |
| No | No | Yes | — | — | Use Supplier Price (Priority 6) |
| No | No | No | — | — | Cost = null, WARNING |
| Any above | — | — | Yes | No | Apply rules to resolved cost |
| Any above | — | — | Yes | Yes | Apply exceptions first, then remaining rules |
| Any above | — | — | — | — + Virtual | Add virtual component costs after all above |

## 4.5 BOM Rollup Cost vs Direct Cost Interaction

When a manufactured SKU appears as a BOM Line in a parent BOM:
- If the Cost Set has a **SKU-specific Cost Item** for that manufactured SKU → use the Cost Set value directly (do not recurse into its BOM)
- If no Cost Set Item exists for that manufactured SKU → recurse into its approved BOM and roll up

**Rationale:** This allows a cost analyst to fix the cost of a frequently-used sub-assembly (e.g., "PCB Assembly = €18.40 regardless of underlying component prices") without losing the ability to analyze that sub-assembly's detailed costs separately.

---

# 5. Cost Calculation Engine

## 5.1 Architecture Overview

The cost calculation engine is a deterministic, stateless pipeline. It takes a context as input and produces a fully-traced cost breakdown as output. It is implemented in the backend service layer and does not mutate database state — it reads data and returns results. The Calculation Trace (Section 6) is written as a side effect after successful completion.

## 5.2 Inputs

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| `sku_id` | UUID | Yes | The top-level SKU to cost |
| `cost_set_id` | UUID | Yes | The costing context |
| `valuation_date` | Date | Yes | The date for price resolution and rule applicability |
| `bom_version_id` | UUID | No | Override to cost a specific BOM version (default: approved version) |
| `site_id` | UUID | No | For site-specific rule application |
| `quantity` | Decimal | No | Default 1.0; for quantity-break price resolution |
| `include_virtual_components` | Boolean | Yes | Whether to include virtual component costs |
| `trace_level` | Enum | Yes | `summary`, `detailed`, `full` — controls trace verbosity |

## 5.3 Calculation Pipeline

```
INPUT CONTEXT
    │
    ▼
STAGE 1: LOAD CONTEXT
    │   Load SKU, Cost Set, BOM Version (or resolve active), Site
    │   Load all Cost Items for Cost Set (indexed by scope)
    │   Load all active Cost Rules (ordered by priority)
    │   Load all Rule Exceptions for context
    │
    ▼
STAGE 2: VALIDATE INPUTS
    │   Run structural validation (no cycles, BOM exists, SKU is active)
    │   Run business validation (cost set is valid for date, BOM is approved)
    │   If blocking errors → ABORT with ValidationError + error list
    │   If warnings → continue, attach warnings to trace
    │
    ▼
STAGE 3: RESOLVE BOM TREE
    │   Load BOM lines in parent-first order (breadth-first)
    │   Detect cycles (visited set, reject if cycle found)
    │   Build in-memory tree with all lines
    │
    ▼
STAGE 4: RESOLVE LEAF COSTS
    │   For each leaf line (no children):
    │     If line_type = sku (purchased_part):
    │       → Execute cost precedence hierarchy (Priorities 1–6)
    │       → Record cost source in trace
    │     If line_type = virtual_component:
    │       → Resolve virtual component's cost (fixed or percentage-pending)
    │       → Mark as virtual, resolve after material subtotal is known
    │
    ▼
STAGE 5: APPLY COST RULES TO LEAF COSTS
    │   For each leaf with a resolved cost:
    │     For each active Cost Rule (in priority order):
    │       Evaluate rule condition against leaf's SKU attributes
    │       Check for Rule Exceptions that suppress this rule
    │       If rule applies and no exception: apply rule action, record in trace
    │       If exception exists: skip rule, record exception in trace
    │
    ▼
STAGE 6: ROLL UP BOM TREE (bottom-up)
    │   For each parent line (post-order traversal):
    │     If parent SKU has Cost Set Item → use direct cost (skip rollup)
    │     Otherwise → subtotal = Σ(qty × adjusted_unit_cost) for all children
    │     Record rollup in trace
    │
    ▼
STAGE 7: RESOLVE VIRTUAL COMPONENT COSTS
    │   For percentage-type virtual components:
    │     Resolve basis (material_subtotal now known)
    │     Calculate virtual_cost = rate × basis
    │   Add all virtual costs to BOM total
    │   Record in trace
    │
    ▼
STAGE 8: APPLY ADJUSTMENTS (from Cost Set)
    │   Apply overhead_pct (from global Cost Item type=overhead_pct)
    │   Apply labor cost (from labor_rate × estimated_labor_hours if defined)
    │   Apply freight (from freight_pct Cost Item if exists)
    │   Record each adjustment in trace with source Cost Item ID
    │
    ▼
STAGE 9: APPLY ROOT-LEVEL COST RULES
    │   Some rules apply to the final rolled-up total (not individual lines)
    │   Execute these last, record in trace
    │
    ▼
STAGE 10: GENERATE CALCULATION TRACE
    │   Assemble TraceHeader (context, timing, engine version)
    │   Assemble TraceLines (one per BOM line with all decisions)
    │   Assemble RuleExecutionRecords (one per rule evaluated)
    │   Assemble CostSourceRecords (one per cost lookup)
    │   Write trace to database (immutable)
    │
    ▼
OUTPUT: CalculationResult
    ├── total_cost (Decimal)
    ├── currency
    ├── cost_breakdown (tree structure mirroring BOM)
    ├── warnings (missing costs, inactive rules, etc.)
    ├── trace_id (reference to the written Calculation Trace)
    └── metadata (engine version, duration, date)
```

## 5.4 Stage Definitions

### Stage 1 — Load Context

| | |
|---|---|
| **Purpose** | Assemble all data required for calculation in a single loading phase to avoid mid-calculation database queries |
| **Input** | sku_id, cost_set_id, valuation_date, optional bom_version_id |
| **Output** | Loaded context object containing SKU, BOM tree, Cost Set with all Items, Cost Rules (ordered), Rule Exceptions |
| **Failure** | SKU not found; Cost Set not found or expired; BOM Version not in approved status |

### Stage 2 — Validate Inputs

| | |
|---|---|
| **Purpose** | Ensure the calculation is structurally and semantically valid before any cost logic runs |
| **Input** | Loaded context |
| **Output** | ValidationResult: blocking errors list + warnings list |
| **Failure (blocking)** | Circular BOM reference; BOM not approved; SKU discontinued; Cost Set outside validity dates |
| **Warnings (non-blocking)** | Missing cost for one or more SKUs; deprecated supplier; Cost Set nearing expiry |

### Stage 3 — Resolve BOM Tree

| | |
|---|---|
| **Purpose** | Load BOM structure into memory in traversal order, detect cycles |
| **Input** | Approved BOM Version |
| **Output** | Ordered list of BOM lines (leaves first, root last) with parent-child relationships |
| **Failure** | Circular reference detected (include path in error); BOM line references inactive SKU |

### Stage 4 — Resolve Leaf Costs

| | |
|---|---|
| **Purpose** | Determine the unit cost for each leaf SKU using the cost precedence hierarchy |
| **Input** | Leaf BOM lines; Cost Set Items (indexed); Supplier Prices (filtered to valuation_date) |
| **Output** | Per-leaf: resolved_cost, cost_source (priority level + source record ID) |
| **Failure** | Not a failure — missing cost is a warning; cost = null for that line |

### Stage 5 — Apply Cost Rules to Leaf Costs

| | |
|---|---|
| **Purpose** | Modify leaf costs according to active business rules |
| **Input** | Leaf costs from Stage 4; sorted Cost Rules; Rule Exceptions |
| **Output** | Per-leaf: adjusted_cost, list of applied rules and exceptions |
| **Failure** | Invalid rule condition (rule is skipped with warning, not calculation failure) |

### Stage 6 — Roll Up BOM Tree

| | |
|---|---|
| **Purpose** | Aggregate child costs into parent costs (bottom-up traversal) |
| **Input** | Adjusted leaf costs; BOM tree structure |
| **Output** | Per BOM line: rolled_up_cost; root_total (material subtotal) |
| **Failure** | Arithmetic overflow (extremely unlikely; surfaced as error) |

### Stage 7 — Resolve Virtual Component Costs

| | |
|---|---|
| **Purpose** | Calculate costs for virtual components that depend on the material subtotal |
| **Input** | Material subtotal from Stage 6; Virtual Component definitions and rates |
| **Output** | Per virtual component: calculated_cost; updated BOM total |
| **Failure** | Virtual component references invalid basis (warn, use 0) |

### Stage 8 — Apply Adjustments

| | |
|---|---|
| **Purpose** | Apply Cost Set-level adjustments (overhead, labor, freight) to the BOM total |
| **Input** | BOM total from Stage 7; adjustment Cost Items from Cost Set |
| **Output** | Adjusted total per cost category; final pre-rule total |
| **Failure** | Non-blocking; missing adjustment is a warning |

### Stage 9 — Apply Root-Level Cost Rules

| | |
|---|---|
| **Purpose** | Apply any rules that target the fully-rolled BOM total (e.g., a margin cap, a minimum cost floor) |
| **Input** | Adjusted total; root-level Cost Rules |
| **Output** | Final total cost |
| **Failure** | Non-blocking; skip rule with warning if condition cannot be evaluated |

### Stage 10 — Generate Calculation Trace

| | |
|---|---|
| **Purpose** | Write an immutable, complete record of every decision made during this calculation |
| **Input** | All outputs from Stages 1–9; timing metadata |
| **Output** | trace_id written to database |
| **Failure** | Trace write failure does not invalidate the calculation result; surfaced as a system alert |

---

# 6. Explainability Architecture

## 6.1 The Explainability Principle

Every cost the platform produces must be fully derivable from source data. A user, auditor, or regulator must be able to ask **"Why does this SKU cost €42.17?"** and receive a complete, navigable answer.

"Navigable" means: from the final cost, the user can drill down through each aggregation to each rule application to each cost source to the original data record that justified the number.

## 6.2 Calculation Trace Model

The Calculation Trace is written once, immediately after a successful calculation, and is never modified. It is the gold standard record of what the engine computed and why.

### Trace Header

| Field | Type | Description |
|-------|------|-------------|
| trace_id | UUID | Primary key |
| sku_id | UUID | Top-level SKU that was costed |
| bom_version_id | UUID | BOM Version used |
| cost_set_id | UUID | Cost Set used |
| valuation_date | Date | Date context for all resolutions |
| site_id | UUID / null | Site context if applicable |
| final_cost | Decimal | The final computed cost |
| currency | Text | Output currency |
| has_warnings | Boolean | Whether any warnings were generated |
| warning_count | Integer | Number of warnings |
| missing_cost_count | Integer | Lines with no cost resolved |
| engine_version | Text | Version of the calculation engine (semver) |
| triggered_by | UUID | Profile ID of the user who triggered the calculation |
| triggered_at | Timestamptz | When the calculation ran |
| duration_ms | Integer | Computation time in milliseconds |
| trace_level | Enum | summary, detailed, full |

### Trace Lines

One record per BOM Line evaluated.

| Field | Type | Description |
|-------|------|-------------|
| trace_line_id | UUID | |
| trace_id | UUID | FK → Trace Header |
| bom_line_id | UUID | FK → BOM Line |
| parent_trace_line_id | UUID / null | FK → Trace Line (parent, for tree navigation) |
| depth | Integer | 0 = root |
| line_type | Enum | sku, virtual_component |
| sku_id / virtual_component_id | UUID | Referenced entity |
| quantity | Decimal | Quantity from BOM Line |
| resolved_unit_cost | Decimal / null | Resolved before rules |
| adjusted_unit_cost | Decimal / null | After rules applied |
| line_total | Decimal / null | quantity × adjusted_unit_cost |
| cost_source_priority | Integer | Which priority level (1–6) was used |
| cost_source_type | Enum | cost_set_item, supplier_price, rollup, virtual, none |
| cost_source_id | UUID / null | ID of the Cost Item or SupplierPrice record that provided the cost |
| is_rolled_up | Boolean | True if cost came from BOM roll-up of children |
| has_missing_cost | Boolean | |
| warnings | JSONB | Line-level warnings array |

### Rule Execution Records

One record per Cost Rule evaluated (whether it applied or not).

| Field | Type | Description |
|-------|------|-------------|
| rule_record_id | UUID | |
| trace_id | UUID | FK → Trace Header |
| trace_line_id | UUID | FK → Trace Line (the line this rule evaluated against) |
| cost_rule_id | UUID | FK → Cost Rule |
| rule_name | Text | Snapshot of rule name at time of calculation |
| condition_evaluated | Text | Human-readable condition expression |
| condition_result | Boolean | Did the condition match? |
| applied | Boolean | Was the rule actually applied? |
| suppressed_by_exception_id | UUID / null | If suppressed, which exception |
| value_before | Decimal / null | Cost before rule application |
| value_after | Decimal / null | Cost after rule application |
| delta | Decimal / null | value_after - value_before |

### Cost Source Records

One record per cost lookup, documenting exactly where a cost came from.

| Field | Type | Description |
|-------|------|-------------|
| source_record_id | UUID | |
| trace_id | UUID | FK → Trace Header |
| trace_line_id | UUID | FK → Trace Line |
| source_type | Enum | cost_set_item, supplier_price, none |
| source_id | UUID / null | FK to the actual record |
| source_table | Text | Table name of the source record |
| resolved_value | Decimal / null | The cost value from that source |
| currency | Text | Currency of resolved value |
| was_selected | Boolean | Was this source actually used (vs. evaluated and skipped)? |
| priority_level | Integer | Which priority level this source represents |

## 6.3 Drill-Down Navigation

A user viewing a final cost of €42.17 for a SKU follows this navigation path:

```
Final Cost: €42.17
  │
  ├── Material Subtotal: €34.50
  │     ├── PCB Assembly (sub-assembly): €18.40 (rolled up)
  │     │     ├── Resistor 10kΩ: €0.02 × 500 = €10.00 [Supplier Price: Mouser, 2026-01-15]
  │     │     ├── Capacitor 100nF: €0.008 × 200 = €1.60 [Cost Set Item: SubFamily=Capacitors]
  │     │     └── PCB Blank: €6.80 [Cost Set Item: SKU-specific]
  │     └── Housing: €4.20 [Supplier Price: Müller GmbH, 2026-03-01]
  │           [Rule Applied: DE Import Surcharge +5% → €4.41]  ← wait, why different?
  │           [Exception: SKU-specific DE exemption → Rule skipped, stays €4.20]
  │
  ├── Virtual Components: €2.51
  │     ├── CE Marking Amortization: €1.20 [fixed, VirtualComponent ID: ...]
  │     └── Packaging: €0.85 × 1.55 (2% scrap): €1.31 [2% of material subtotal €34.50 + scrap]
  │           Wait: €34.50 × 2% = €0.69 + €0.85 = €1.54? Let me re-check → trace shows exact calc
  │
  ├── Overhead (12%): €4.44 [Cost Set Item: global overhead_pct, Cost Set "Standard 2026"]
  │
  └── Labor (€45/hr × 0.15hr): €6.75 [Cost Set Item: global labor_rate, labor_hours from BOM]
        [Rule Applied: Regulatory Labor Surcharge +10% → but Exception for this SKU → not applied]
```

Every number in this drill-down has a hyperlink to the source record that justified it.

## 6.4 Required Data Per Cost Figure

For every cost figure displayed to a user, the following must be resolvable:

| Data Category | Required Fields | Where stored |
|--------------|-----------------|-------------|
| Trace Data | trace_id, trace_line_id, valuation_date, engine_version | Calculation Trace |
| Explanation | why this cost was chosen (precedence level), what alternatives were considered | Trace Lines + Cost Source Records |
| Audit Data | who triggered, when, from what inputs | Trace Header |
| Drill-down | parent-child tree of trace lines | Trace Lines (self-referential) |
| Source Link | exact record (CostItem or SupplierPrice) that provided the value | Cost Source Records |
| Rule History | every rule evaluated, applied, or suppressed | Rule Execution Records |

---

# 7. Validation Engine

## 7.1 Architecture

The Validation Engine is a **separate, independently-runnable subsystem**. It does not perform costing — it evaluates data quality and business correctness. It can be triggered:

- On write (pre-save validation for blocking errors)
- On demand (user triggers full validation report for a BOM or SKU)
- On schedule (nightly background validation run)
- Before calculation (Stage 2 of the Cost Engine)

Validation results are returned as a structured list of findings, never as exceptions that halt the system.

## 7.2 Validation Categories

### Category A — Structural Validation

Validates the integrity of data relationships, regardless of business rules.

| Rule ID | Rule Name | Business Reason | Detection Logic | Severity | Auto-Fix | User Action |
|---------|-----------|----------------|-----------------|----------|----------|-------------|
| V-001 | Circular BOM Reference | A BOM that references itself (directly or transitively) would cause infinite recursion in the cost engine | Traverse from each BOM line upward to root; if candidate SKU appears in the path, flag | ERROR | No | Remove the circular line or restructure BOM |
| V-002 | Duplicate BOM Line | The same SKU appearing twice at the same level in the same BOM produces incorrect quantities | Group BOM lines by (bom_version_id, parent_line_id, sku_id); flag duplicates | WARNING | Merge if quantities are the same | Review and consolidate duplicate lines |
| V-003 | BOM Line with Invalid Quantity | Quantity ≤ 0 is not a valid manufacturing quantity | Check bom_lines.quantity > 0 | ERROR | No | Correct the quantity |
| V-004 | BOM Line References Inactive SKU | A BOM containing a discontinued or archived SKU cannot be safely costed | Join bom_lines to skus where status != 'active' | WARNING | No | Replace with active SKU or archive BOM version |
| V-005 | BOM Line UOM Mismatch | BOM line UOM must match the referenced SKU's unit_of_measure | Join bom_lines to skus, compare UOM | ERROR | No | Align units of measure |
| V-006 | Orphan Virtual Component | A Virtual Component assigned to a BOM that has no cost entry anywhere | Left join virtual_components to bom_lines; check has cost in any cost set | WARNING | No | Add a Cost Item for this virtual component |
| V-007 | Conflicting SupplierPrice Dates | Two SupplierPrice records for the same SKU+Supplier overlap in date | Self-join supplier_prices, detect date overlap | ERROR | No | Correct effective dates |
| V-008 | BOM Version Without Lines | An approved BOM Version with no BOM Lines cannot produce a cost | Check bom_versions where status = 'approved' and count(bom_lines) = 0 | ERROR | No | Add lines or archive the version |

---

### Category B — Business Validation

Validates that data satisfies business rules, even when structurally valid.

| Rule ID | Rule Name | Business Reason | Detection Logic | Severity | Auto-Fix | User Action |
|---------|-----------|----------------|-----------------|----------|----------|-------------|
| V-010 | Missing Cost for Active SKU | An active purchased_part SKU with no SupplierPrice and no Cost Set Item cannot be costed | Left join skus to supplier_prices + cost_items; flag nulls for active buy SKUs | WARNING | No | Add SupplierPrice or Cost Set Item |
| V-011 | Orphan SKU | An active SKU that appears in no BOM and has no inventory may be stale | Left join skus to bom_lines and inventory_lines | WARNING | No | Archive if no longer needed |
| V-012 | Missing SKU Classification | A SKU with no Family/SubFamily cannot be targeted by category-level Cost Rules | Check skus where family_id IS NULL | WARNING | No | Assign Family and SubFamily |
| V-013 | Unapproved Rule Exception | A Rule Exception in 'requested' status is blocking intended rule application | Query rule_exceptions where status = 'requested' and age > 48h | WARNING | No | Approver must review and approve |
| V-014 | Expired Cost Set in Use | A Cost Set past its effective_to date is referenced by an open costing context | Check cost_set assignments vs cost_sets.effective_to | ERROR | No | Update cost set assignment |
| V-015 | Invalid Rule Assignment | A Cost Rule references a non-existent Family, SubFamily, or Supplier | Validate cost_rules.condition_value against referenced entity | ERROR | No | Correct rule condition value |
| V-016 | Broken Rule Exception | A Rule Exception references a deleted or inactive Cost Rule | Join rule_exceptions to cost_rules where is_active = false | WARNING | No | Remove exception or reactivate rule |
| V-017 | Context Mismatch | A Cost Rule has a cost_set_scope that doesn't match the active costing context | Evaluate rule applicability against current context | INFO | No | Review rule scope settings |

---

### Category C — Cost Validation

Validates the inputs to cost calculation for completeness and consistency.

| Rule ID | Rule Name | Business Reason | Detection Logic | Severity | Auto-Fix | User Action |
|---------|-----------|----------------|-----------------|----------|----------|-------------|
| V-020 | Missing Cost at Any BOM Level | A BOM where one or more lines have no resolvable cost will produce an incomplete total | Run cost resolution (Stage 4 of engine) without committing; flag nulls | WARNING | No | Add cost for the missing line |
| V-021 | Cost Set Has No Global Overhead | A Cost Set without an overhead Cost Item will understate cost | Check cost_items for (cost_set_id, item_type='overhead_pct', scope='global') | WARNING | No | Add overhead to cost set |
| V-022 | Currency Without Exchange Rate | A Cost Item in a non-base currency with no exchange rate defined cannot be normalized | Check cost_items.currency vs cost_set.base_currency; verify exchange rate availability | ERROR | No | Add exchange rate or change currency |
| V-023 | Stale Supplier Price | A SupplierPrice more than 12 months old is being used as the active price | Check effective_from age > 365 days for active prices | WARNING | No | Obtain updated quote from supplier |

---

### Category D — Inventory Validation

Validates inventory snapshot data before valuation.

| Rule ID | Rule Name | Business Reason | Detection Logic | Severity | Auto-Fix | User Action |
|---------|-----------|----------------|-----------------|----------|----------|-------------|
| V-030 | Inventory Line Without Cost | An inventory line for a SKU with no resolvable cost cannot be valued | Pre-calculate cost for each SKU in snapshot; flag nulls | ERROR | No | Resolve cost before approving snapshot |
| V-031 | Inventory Quantity ≤ 0 | Inventory lines with zero or negative quantity are invalid for valuation | Check inventory_lines.quantity > 0 | ERROR | No | Correct quantity or remove line |
| V-032 | SKU in Inventory Without Active Status | A discontinued SKU appearing in inventory requires attention | Join inventory_lines to skus where status != 'active' | WARNING | No | Verify and disposition the physical stock |
| V-033 | Snapshot Valuation Date After Cost Set Expiry | The snapshot date falls outside the Cost Set's validity window | Compare snapshot_date to cost_set effective dates | ERROR | No | Select a valid cost set for the snapshot date |

---

# 8. Inventory Valuation Architecture

## 8.1 Purpose and Business Context

Inventory valuation answers: **"What is the total value of our inventory, in cost terms, at a given point in time?"**

In medical device manufacturing, this is required for:
- Monthly financial closing (COGS, inventory balance sheet)
- Regulatory submissions (demonstrating cost basis for pricing justification)
- Project cost tracking (what did this batch of devices cost us?)
- Insurance valuation (replacement cost of stock)

## 8.2 Core Design Requirements

1. **Reproducibility:** A valuation created on 2026-01-01 must produce the exact same result if re-run years later. This requires freezing cost values at snapshot time.

2. **Isolation:** Each snapshot is independent. Changing a Cost Set or BOM after a snapshot is created does not retroactively change the snapshot's valuation.

3. **Auditability:** Every snapshot records who created it, when, against what cost set, and the full cost trace for each line.

4. **Granularity:** Valuation can be performed at Organization, Site, Warehouse, or Project level.

5. **Historical Navigation:** A user must be able to retrieve and compare snapshots from any past date.

## 8.3 Inventory Snapshot Model

### Inventory Snapshot

| Field | Type | Description |
|-------|------|-------------|
| snapshot_id | UUID | Primary key |
| organization_id | UUID | FK → Organization |
| snapshot_date | Date | Point-in-time reference date |
| snapshot_type | Enum | `full`, `partial`, `project` |
| scope_site_id | UUID / null | Scope to a specific site |
| scope_warehouse_id | UUID / null | Scope to a specific warehouse |
| scope_project_id | UUID / null | Scope to a specific project |
| cost_set_id | UUID | FK → Cost Set used for valuation |
| cost_set_snapshot | JSONB | **Frozen copy of the Cost Set's parameters at snapshot time** — ensures reproducibility |
| status | Enum | `draft`, `under_review`, `approved`, `superseded` |
| total_value | Decimal | Sum of all line values (populated after calculation) |
| base_currency | Text | ISO 4217 |
| line_count | Integer | Number of inventory lines |
| missing_cost_count | Integer | Lines with no resolved cost |
| approved_by | UUID / null | FK → Profile |
| approved_at | Timestamptz / null | |
| notes | Text | Context for why this snapshot was taken |
| created_by | UUID | FK → Profile |
| created_at | Timestamptz | |

**Critical design note — `cost_set_snapshot` JSONB field:**  
When a snapshot is approved, the system copies the full Cost Set (all Cost Items, all parameters valid at the snapshot_date) into this JSONB field. This ensures that years later, the system can reproduce the exact valuation logic that was applied, even if the live Cost Set has been modified or archived.

### Inventory Line

| Field | Type | Description |
|-------|------|-------------|
| line_id | UUID | Primary key |
| snapshot_id | UUID | FK → Inventory Snapshot |
| sku_id | UUID | FK → SKU |
| warehouse_id | UUID | FK → Warehouse |
| quantity | Decimal | Physical quantity at snapshot date |
| unit_cost | Decimal | **Frozen unit cost at time of valuation** — not a reference, a copy |
| total_value | Decimal | quantity × unit_cost (pre-calculated and stored) |
| currency | Text | ISO 4217 |
| cost_trace_id | UUID / null | FK → Calculation Trace for this line's cost |
| cost_source | Enum | cost_set_item, supplier_price, rollup, manual, none |
| bom_version_id | UUID / null | BOM Version used for rollup cost |
| has_missing_cost | Boolean | Whether cost could not be resolved |
| notes | Text / null | Line-level notes |

## 8.4 Valuation Calculation Process

```
TRIGGER: User creates Inventory Snapshot Draft
    │
    ▼
INPUT ENTRY: User enters quantities per SKU per Warehouse
    │   OR imports from CSV
    │   OR pulls from integration (Phase 3+)
    │
    ▼
VALIDATION: Run Category D validation
    │   Flag missing costs, invalid quantities, inactive SKUs
    │   User resolves errors before approval
    │
    ▼
COST RESOLUTION: For each Inventory Line
    │   Run Cost Engine (Stages 1-10) with:
    │     sku_id = line.sku_id
    │     cost_set_id = snapshot.cost_set_id
    │     valuation_date = snapshot.snapshot_date
    │   Store trace_id on inventory line
    │   Store frozen unit_cost = engine output final_cost
    │
    ▼
AGGREGATION: Calculate total_value for all lines
    │   total_value = Σ(quantity × unit_cost) per snapshot
    │
    ▼
REVIEW: Snapshot enters 'under_review' status
    │   Approver reviews total, line details, missing costs
    │   Can request changes (returns to draft) or approve
    │
    ▼
APPROVAL: Snapshot enters 'approved' status
    │   System freezes cost_set_snapshot (copies live Cost Set to JSONB)
    │   Status becomes immutable (no further edits)
    │   Previous approved snapshot for same scope becomes 'superseded'
    │
    ▼
OUTPUT: Approved Inventory Snapshot
    ├── Total inventory value by warehouse
    ├── Total inventory value by family/subfamiy
    ├── Lines with missing cost flagged
    └── Full drill-down via cost_trace_id
```

## 8.5 Historical Valuation Reproducibility

To reproduce a historical valuation:

1. Load the `inventory_snapshot` record for the target date and scope
2. For each `inventory_line`, the `unit_cost` is already frozen — no recalculation needed
3. For explanation/audit: load the `cost_trace_id` for each line to see the original calculation decisions
4. If the Cost Set changed after the snapshot: the `cost_set_snapshot` JSONB field contains the exact parameters that were used — compare against current to see what changed

This means **the platform never needs to "replay" a historical valuation** — it is always available as stored data. Reproducibility is guaranteed by data design, not by engine re-execution.

## 8.6 Valuation Report

The valuation report is generated from approved snapshot data and includes:

| Report Section | Content |
|---------------|---------|
| Summary | Total value, currency, scope, date, approver |
| By Warehouse | Value broken down per warehouse |
| By Family | Value broken down per SKU Family |
| By SKU | Individual line values with unit cost and quantity |
| Missing Costs | SKUs with no cost, flagged for action |
| Comparison | Side-by-side with previous snapshot (delta) |
| Audit Footer | Created by, approved by, cost set used, engine version |

---

# 9. Rule Engine Architecture

## 9.1 Purpose

The Rule Engine allows cost analysts and finance teams to codify business cost policies as named, maintainable, traceable rules — without developer involvement. Rules are applied consistently across all calculations and all inventory valuations.

## 9.2 Rule Definition

A Cost Rule has three components: **condition** (when it fires), **action** (what it does), and **scope** (where it applies).

### Rule Condition Model

Conditions are expressed as a triple: `(field, operator, value)`

| Condition Field | Example Value |
|----------------|---------------|
| `sku.family_id` | UUID of a Family |
| `sku.sub_family_id` | UUID of a SubFamily |
| `sku.item_type` | `purchased_part` |
| `sku.make_buy` | `buy` |
| `supplier.country` | `CN` (ISO 3166-1) |
| `supplier_price.currency` | `USD` |
| `cost_item.item_type` | `material_price` |
| `bom_line.depth` | `0` (root level only) |

| Condition Operator | Meaning |
|-------------------|---------|
| `equals` | Field exactly matches value |
| `not_equals` | Field does not match value |
| `in` | Field is in a list of values |
| `not_in` | Field is not in a list |
| `greater_than` | Field > value (numeric) |
| `less_than` | Field < value (numeric) |
| `is_null` | Field has no value |
| `is_not_null` | Field has a value |

Multiple conditions on the same rule are combined with AND logic. OR logic requires separate rules with the same action and priority.

### Rule Action Model

| Action Type | Description | Value Field |
|-------------|-------------|-------------|
| `add_percentage` | Increases cost by N% | Percentage (e.g., 8.0 for 8%) |
| `add_fixed` | Adds a fixed amount per unit | Amount in cost set base currency |
| `multiply` | Multiplies cost by a factor | Factor (e.g., 1.05 for +5%) |
| `replace_cost` | Replaces resolved cost entirely | New cost value |
| `exclude_from_rollup` | Line is costed but excluded from parent total | (no value) |
| `cap_at_value` | Cost cannot exceed this ceiling | Cap value |
| `floor_at_value` | Cost cannot go below this floor | Floor value |

### Rule Priority and Execution Order

- Rules are evaluated in ascending priority order (priority 1 fires first)
- All matching rules fire unless a Rule Exception suppresses them
- Rule actions stack: if two `add_percentage` rules both match, both additions are applied
- If two `replace_cost` rules match, the one with higher priority (lower number) wins and the second is logged as skipped

### Conflict Resolution

| Conflict Type | Resolution |
|--------------|-----------|
| Multiple `add_percentage` | Both apply; each recorded separately in trace |
| Multiple `replace_cost` | Highest priority wins; lower priority logged as suppressed |
| `replace_cost` vs `add_percentage` | `replace_cost` fires first (highest priority); then `add_percentage` applies to the replaced value |
| Rule vs Exception | Exception always suppresses the rule |

## 9.3 Rule Exception Handling

Rule Exceptions are matched before rule evaluation. For each BOM Line:

1. Load all Rule Exceptions with scope matching this line's SKU, BOM Version, Family, or Supplier
2. For each active Cost Rule: check if any matched exception suppresses it
3. If suppressed: skip rule, record exception in trace
4. If not suppressed: evaluate rule condition, apply if matches

## 9.4 Rule Traceability

Every rule evaluation (whether the rule fired or not) is recorded in the Rule Execution Record (see Section 6). This means:
- A user can see every rule that was considered for their SKU's cost
- A user can see which rules fired and by how much
- A user can see which rules were suppressed by exceptions
- A finance manager can audit that the correct rules are being applied

## 9.5 Business User Rule Maintenance

Business users (Cost Analysts, Finance) maintain rules through the UI without developer involvement:

| Action | UI Capability |
|--------|--------------|
| Create rule | Rule Builder form with condition fields and action dropdowns |
| Test rule | "Test this rule" against a specific SKU/BOM to preview the effect before activating |
| Activate/deactivate | Toggle with effective dates |
| Request exception | Exception Request form with justification field |
| Review trace | "Why was this rule applied/not applied?" drill-down from any cost view |

**Principle:** Rules are data, not code. A developer is never required to deploy a new version to add or change a business cost rule.

---

# 10. Audit Architecture

## 10.1 Architecture Overview

The Audit subsystem provides an immutable, queryable record of:
- Every data mutation (who changed what, when, before/after)
- Every calculation execution (what was computed, from what inputs)
- Every rule execution (which rules fired, why)
- Every inventory valuation (who approved, what was valued)

The Audit Log is **append-only**. No UPDATE or DELETE operations are permitted on audit records. This is enforced by:
1. A PostgreSQL RLS policy that prevents UPDATE and DELETE on audit tables for all roles including `admin`
2. An application-layer assertion that the audit write path never calls UPDATE or DELETE

## 10.2 Audit Event Types

| Event Type | Category | Trigger | Stored By |
|-----------|---------|---------|-----------|
| `data.insert` | Data | Any INSERT on business tables | DB Trigger |
| `data.update` | Data | Any UPDATE on business tables | DB Trigger |
| `data.delete` | Data | Any DELETE on business tables | DB Trigger |
| `bom.approved` | Workflow | BOM Version status → 'approved' | Application |
| `bom.superseded` | Workflow | BOM Version status → 'superseded' | Application |
| `snapshot.approved` | Workflow | Inventory Snapshot status → 'approved' | Application |
| `rule.activated` | Rule | Cost Rule status → active | Application |
| `rule.deactivated` | Rule | Cost Rule status → inactive | Application |
| `exception.approved` | Rule | Rule Exception status → approved | Application |
| `calculation.executed` | Calculation | Cost engine run completed | Application |
| `valuation.executed` | Valuation | Inventory valuation computed | Application |
| `user.invited` | Admin | New user invited | Application |
| `user.role_changed` | Admin | User role modified | Application |
| `user.deactivated` | Admin | User deactivated | Application |

## 10.3 Audit Event Model

| Field | Type | Description |
|-------|------|-------------|
| audit_id | UUID | Primary key |
| event_type | Enum | From the event type list above |
| event_category | Enum | data, workflow, rule, calculation, valuation, admin |
| organization_id | UUID | FK → Organization |
| table_name | Text | Business table affected (for data events) |
| record_id | UUID | PK of the affected record |
| performed_by | UUID | FK → Profile (null if system-triggered) |
| performed_at | Timestamptz | Server-side timestamp |
| session_id | UUID | FK to auth session (enables session-level audit trail) |
| ip_address | Inet | Client IP at time of action |
| old_values | JSONB / null | Full row before mutation (for update/delete) |
| new_values | JSONB / null | Full row after mutation (for insert/update) |
| change_delta | JSONB / null | Only the fields that changed (derived, for readability) |
| reference_id | UUID / null | Associated trace_id, snapshot_id, etc. |
| metadata | JSONB / null | Event-specific extra data |

## 10.4 Data Mutation Audit (DB Trigger Strategy)

A PostgreSQL trigger is installed on each business table. The trigger fires AFTER INSERT, UPDATE, DELETE and writes one row to `audit_events`. The trigger uses `auth.uid()` to capture the performing user from the active Supabase session.

**Tables covered by trigger:**
organizations, profiles, skus, families, sub_families, suppliers, supplier_prices, boms, bom_versions, bom_lines, cost_sets, cost_items, cost_rules, rule_exceptions, virtual_components, inventory_snapshots, inventory_lines, sites, warehouses, projects

**`audit_events` is explicitly excluded from trigger coverage** (no trigger on the audit table itself — this prevents recursive logging).

## 10.5 Immutability Requirements

| Requirement | Mechanism |
|------------|-----------|
| No UPDATE on audit_events | RLS: `WITH CHECK (false)` on UPDATE for all roles |
| No DELETE on audit_events | RLS: `WITH CHECK (false)` on DELETE for all roles |
| No direct DB access | Service role is the only key with broader access; usage is monitored |
| Retention minimum | 7 years (medical device regulatory requirement) |
| Backup verification | Monthly verification that audit backup is complete and uncorrupted |

## 10.6 Audit Log Viewer

The platform provides an audit log viewer for `admin` role users with:

- Filter by: event_type, table_name, performed_by, date range, record_id
- View before/after values in diff format
- Navigate from any changed record to its full audit history
- Export to CSV for external audit tools
- Investigation workflow: an admin can "annotate" an audit entry with an investigation note (stored separately, not modifying the audit entry itself)

## 10.7 Calculation and Rule Execution History

Calculation executions are surfaced through the Calculation Trace (Section 6). The Audit Log stores a `calculation.executed` event that links to the trace via `reference_id = trace_id`. This means:

- The Audit Log provides "who ran a calculation and when" (data event)
- The Calculation Trace provides "what decisions were made" (content event)
- Together they provide the complete picture for regulatory audit questions

---

# 11. MVP Scope Definition

## 11.1 MVP Philosophy

The MVP must deliver end-to-end value for the primary business capability: **a cost analyst can open the platform, build a BOM, assign costs, and produce an explainable, auditable cost figure.** Everything else is Phase 2 or later.

The MVP must not:
- Be a partial system where the core workflow requires workarounds
- Expose users to unexplained cost figures
- Allow data to enter the system without auditability
- Skip validation that prevents data corruption

## 11.2 Feature Classification

### MVP — Core BOM Costing

| # | Feature | Justification |
|---|---------|--------------|
| 1 | Organization setup and user management (all roles) | Platform is unusable without auth and roles |
| 2 | SKU master (create, edit, classify by Family/SubFamily) | Foundational entity — all other features depend on it |
| 3 | Family and SubFamily management | Required for rule targeting and reporting |
| 4 | Supplier management (create, qualify) | Required for supplier pricing |
| 5 | Supplier price catalog (date-ranged) | Primary cost source for purchased parts |
| 6 | BOM authoring (multi-level, with sub-assemblies) | Core product capability |
| 7 | BOM versioning (draft → approved lifecycle) | Required for auditability and immutability |
| 8 | BOM structural validation (cycles, duplicates, invalid quantities) | Required to prevent data corruption |
| 9 | Virtual Component library (create, manage) | Required for complete cost representation |
| 10 | Cost Set management (create, manage) | Required for any costing beyond raw supplier prices |
| 11 | Cost Item management (within cost sets) | Required for overhead, labor, and category costs |
| 12 | Cost Calculation Engine (all 10 stages) | The core value proposition |
| 13 | Calculation Trace (full trace, drill-down) | Non-negotiable — Explainability First principle |
| 14 | Cost Rule management (create, activate, test) | Required for business cost policies |
| 15 | Rule Exception management (request + approve) | Required for rule engine integrity |
| 16 | Audit log (DB triggers on all tables) | Non-negotiable — medical device auditability |
| 17 | Cost breakdown export (CSV) | Minimum viable reporting |
| 18 | BOM validation warnings in UI (missing cost, orphan) | Required for usable cost output |

### MVP — Constraints to protect scope

| Constraint | Reason |
|-----------|--------|
| Single currency only (no FX conversion) | FX adds significant complexity; most initial BOMs are single-currency |
| No BOM diff view | Useful but not required to compute a cost |
| No Inventory Valuation | Phase 2 — separate but co-designed data model is sufficient |
| No email notifications | Nice to have; not required for core workflow |
| No PDF export | CSV is sufficient for MVP; PDF adds UI complexity |
| No Project-level scoping | Phase 2 |
| No ERP integration | Future |
| No bulk import | Phase 2 |

### Phase 2 — Inventory Valuation

| # | Feature | Justification |
|---|---------|--------------|
| 1 | Site and Warehouse management | Required for inventory scoping |
| 2 | Inventory Snapshot (create, enter quantities) | Core of the inventory domain |
| 3 | Inventory Line management | Part of snapshot |
| 4 | Snapshot valuation (cost engine integration) | Core capability |
| 5 | Snapshot approval workflow | Required for auditability |
| 6 | Historical snapshot navigation | Required for financial closing |
| 7 | Valuation report (by warehouse, by family) | Primary output of this domain |
| 8 | CSV export of valuation report | Required for accounting integration |
| 9 | Multi-currency support (FX rates) | Needed for cross-border valuation |
| 10 | Snapshot comparison (vs. previous period) | Required for trend analysis |

### Phase 2 — Enhanced Costing

| # | Feature | Justification |
|---|---------|--------------|
| 1 | BOM version diff view | Useful for change impact analysis |
| 2 | Scenario comparison (Cost Set A vs B) | High-value for finance teams |
| 3 | PDF export of cost breakdown | Stakeholder communication |
| 4 | Cost trend chart (cost over time per SKU) | Procurement tracking |
| 5 | Bulk SKU / BOM import (CSV) | Onboarding efficiency |

### Phase 3 — Advanced Features

| # | Feature | Justification |
|---|---------|--------------|
| 1 | Project-level inventory valuation | Complex scoping |
| 2 | ECO (Engineering Change Order) workflow | Change management |
| 3 | Email / notification system | Approval workflow UX |
| 4 | Audit log viewer (full UI) | Admin capability |
| 5 | Rule simulation ("what if this rule existed?") | Planning tool |
| 6 | Supplier qualification workflow | Procurement compliance |

### Future

| # | Feature | Justification |
|---|---------|--------------|
| 1 | ERP integration (read/write) | Complex; requires integration contracts |
| 2 | PLM / CAD data import | Complex; requires format mapping |
| 3 | Real-time market price feeds | External dependency |
| 4 | Mobile PWA | Not a primary use case for cost analysts |
| 5 | AI-assisted cost anomaly detection | Future intelligence layer |

---

# 12. Future Roadmap

## Phase 0 — Foundation (Current, Week 0)
- Repository scaffolding, architecture documentation
- All blocking issues from audit resolved in documentation
- Schema design (DATA_MODEL v2 based on this blueprint)
- First commit

## Phase 1 — Infrastructure (Weeks 1–3)
- Supabase project provisioned (dev + staging + prod)
- All MVP database migrations written and applied
- RLS policies for all tables
- Audit trigger on all business tables
- Supabase Auth + profile creation
- `supabase gen types typescript` wired into CI
- GitHub Actions: lint + type-check + migration validation on PR
- Local dev environment: `supabase start` working for all team members

## Phase 2 — BOM Domain (Weeks 4–7)
- SKU master CRUD (with Family / SubFamily)
- BOM authoring (multi-level, self-referential)
- BOM versioning lifecycle
- BOM structural validation (V-001 through V-008)
- Virtual Component library

## Phase 3 — Costing Domain (Weeks 8–12)
- Supplier and SupplierPrice management
- Cost Set and Cost Item management
- Cost Rule management (create, activate, test)
- Rule Exception (request + approve)
- Cost Calculation Engine (all 10 stages)
- Calculation Trace (write + read + drill-down)
- CSV export

## Phase 4 — MVP Hardening (Weeks 13–14)
- Full validation engine (all categories)
- Performance testing (500-component BOM roll-up < 2s)
- Security review (RLS, service_role, input validation)
- Error monitoring (Sentry)
- User acceptance testing
- Production deployment

## Phase 5 — Inventory Valuation (Weeks 15–20)
- Site + Warehouse management
- Inventory Snapshot + Line management
- Snapshot valuation (cost engine integration)
- Snapshot approval workflow
- Multi-currency support
- Historical navigation + comparison report

---

# 13. Risk Register

| ID | Risk | Category | Probability | Impact | Severity | Mitigation |
|----|------|----------|-------------|--------|----------|-----------|
| R-01 | BOM cycle detection missed at write time allows data corruption | Data Integrity | Medium | Critical | **HIGH** | Cycle check is mandatory before any BOM Line insert/update; enforced in application layer and validated on every calculation |
| R-02 | Cost Set frozen copy becomes inconsistent with live data | Data Integrity | Low | High | **HIGH** | `cost_set_snapshot` is a complete JSONB copy taken at approval time; tested by snapshot reproduction tests |
| R-03 | Inventory valuation not reproducible after Cost Set changes | Calculation | Medium | High | **HIGH** | Frozen `cost_set_snapshot` and frozen `unit_cost` on inventory lines guarantee reproducibility by design |
| R-04 | Rule Engine produces unexpected interactions between stacked rules | Business Logic | Medium | Medium | **MEDIUM** | Rule test capability before activation; rule execution records in trace; approval required for new rules |
| R-05 | Audit log trigger disabled or bypassed by admin | Auditability | Low | Critical | **MEDIUM** | RLS prevents DELETE/UPDATE on audit_events; trigger re-application verified in CI migration tests |
| R-06 | Cost Calculation Engine performance degrades on large BOMs | Performance | Medium | Medium | **MEDIUM** | Stage 1 loads entire BOM tree in one query; target: 500-component BOM < 2s; benchmarked in Phase 4 |
| R-07 | Missing cost for a BOM line is silently treated as zero | Calculation | Medium | High | **MEDIUM** | Engine returns null (not zero) for missing costs; null lines are flagged in trace and in UI; totals marked as "incomplete" |
| R-08 | SupplierPrice date ranges overlap, producing ambiguous active price | Data Integrity | Medium | Medium | **MEDIUM** | Overlap validated at write time (V-007); unique constraint candidate on (sku_id, supplier_id, effective_from) |
| R-09 | Rule Exceptions approved without business justification | Business Logic | Low | Medium | **LOW** | `business_justification` is a required (non-nullable) field on RuleException; UI enforces non-empty |
| R-10 | Calculation Trace write failure causes phantom costs (untraceable) | Auditability | Low | High | **MEDIUM** | Trace write failure is surfaced as a system alert; calculation result is still returned but flagged as "untraced" |

---

# 14. Architectural Decisions

## ADR-101: Unified SKU Model (replaces separate Product + Component tables)

**Decision:** Use a single `skus` table with `item_type` (`purchased_part`, `sub_assembly`, `finished_good`) and `make_buy` (`make`, `buy`, `make_or_buy`) instead of separate `products` and `components` tables.

**Reason:** In manufacturing, the same part number can be purchased or manufactured depending on capacity and strategy. A single entity with type attributes captures this correctly. Separate tables create duplication, ambiguous foreign keys, and complicate the BOM Line model (which table does this line reference?).

**Consequence:** BOM Lines have a single `sku_id` FK for physical items (whether purchased or manufactured) and a separate `virtual_component_id` FK for non-physical cost elements.

---

## ADR-102: Cost Set as Organization-Wide Context (replaces BOM-scoped Scenarios)

**Decision:** Replace `cost_scenarios` (per-BOM) with `cost_sets` (organization-wide, reusable). A "scenario comparison" is implemented as computing the same BOM under two different Cost Sets.

**Reason:** If overhead rates are defined per-BOM, changing the organization's overhead rate requires updating every BOM's scenario. With Cost Sets, one update to the Cost Set propagates instantly to all BOMs that reference it.

**Consequence:** Cost Sets are shared resources. Locking a Cost Set (after snapshot approval) prevents modifications that would affect historical comparisons.

---

## ADR-103: Frozen Cost at Snapshot Time (not re-calculated on retrieval)

**Decision:** When an Inventory Snapshot is approved, `unit_cost` and `total_value` are written as concrete numeric values on each Inventory Line. Retrieval reads stored values, not live calculations.

**Reason:** Reproducibility requires that a snapshot taken on 2026-01-01 returns the same value in 2031. If we stored references to Cost Set Items and recalculated, any future change to those items would change the historical valuation.

**Consequence:** Inventory Lines contain redundant data (cost is also in the Cost Set), but this is intentional and required for correctness.

---

## ADR-104: Calculation Trace is Written by the Engine, Read by the UI

**Decision:** The Cost Calculation Engine writes an immutable Calculation Trace after each run. The UI reads traces — it never generates cost explanations independently.

**Reason:** If the UI computed explanations separately from the engine, they could diverge. The trace is the authoritative record of what the engine decided.

**Consequence:** The trace must be written before the calculation result is returned to the user. If the trace write fails, the result is still returned but flagged as untraced (a recoverable alert, not a calculation failure).

---

## ADR-105: Validation Engine is Separate from Calculation Engine

**Decision:** The Validation Engine (Section 7) runs as an independent subsystem. The Cost Calculation Engine calls it as Stage 2 but does not embed validation logic within calculation stages.

**Reason:** Validation must be runnable without performing a calculation (on-demand BOM health check). Embedding validation in the cost engine would make this impossible without significant refactoring.

**Consequence:** Validation rules (V-001 through V-033) are maintained in one place and run consistently whether triggered by the cost engine, a scheduled job, or a user-initiated check.

---

## ADR-106: BOM Cycle Detection at Write Time

**Decision:** Cycle detection runs on every BOM Line INSERT or UPDATE, not during calculation.

**Reason:** Detecting cycles at calculation time (Stage 2) is correct but late — corrupted data exists in the database between the write and the next calculation. The database should never contain a circular BOM. Catching it at write time prevents the corrupted state.

**Consequence:** Every BOM Line write requires a parent-chain traversal (upward from the proposed parent to the root). For shallow BOMs (< 10 levels) this is negligible. The validation runs in the application layer (not as a DB constraint) because the logic requires graph traversal.

---

## ADR-107: Rule Engine Operates on Resolved Unit Costs, Not Raw Data

**Decision:** Cost Rules are applied after the cost precedence hierarchy resolves a unit cost (Stage 5), not before.

**Reason:** Rules modify a cost that already exists. Applying rules to raw supplier prices before the precedence hierarchy runs would create ambiguity about which cost the rule is modifying.

**Consequence:** A rule like "add 8% to all Chinese supplier costs" operates on the resolved cost (whether it came from Priority 6 supplier price or Priority 1 Cost Set Item). This is the intended business behavior.

---

# 15. Recommended Next Development Step

## Immediate Action: Rewrite DATA_MODEL.md

The architecture audit (Phase 0) established that the current `DATA_MODEL.md` covers only 1 of 9 required entities (BOMLine). The first engineering deliverable is a complete data model rewrite based on this blueprint.

The rewrite must define all tables in the following order:

```
Tier 1 — Foundation (no FKs to business entities)
  organizations, families, sub_families, sites, warehouses, projects,
  virtual_components

Tier 2 — Identity
  profiles (FK → auth.users, organizations)

Tier 3 — Item Domain
  skus (FK → organizations, families, sub_families)
  suppliers (FK → organizations)
  supplier_prices (FK → skus, suppliers, profiles)

Tier 4 — BOM Domain
  boms (FK → skus)
  bom_versions (FK → boms, profiles×2)
  bom_lines (FK → bom_versions, bom_lines[self], skus, virtual_components)

Tier 5 — Costing Domain
  cost_sets (FK → organizations, profiles)
  cost_items (FK → cost_sets, profiles)
  cost_rules (FK → organizations, cost_sets, profiles)
  rule_exceptions (FK → cost_rules, profiles×2)

Tier 6 — Inventory Domain (Phase 2 — design now, implement later)
  inventory_snapshots (FK → organizations, cost_sets, sites, warehouses, projects, profiles×2)
  inventory_lines (FK → inventory_snapshots, skus, warehouses, profiles)

Tier 7 — Observability
  calculation_traces (FK → skus, bom_versions, cost_sets, profiles, sites)
  calculation_trace_lines (FK → calculation_traces, bom_lines, calculation_trace_lines[self])
  rule_execution_records (FK → calculation_traces, calculation_trace_lines, cost_rules, rule_exceptions)
  cost_source_records (FK → calculation_traces, calculation_trace_lines)
  audit_events (FK → organizations, profiles)
```

**Each table definition must include:**
- All columns with types, nullability, and constraints
- Primary key strategy (UUID v4 for all)
- Foreign key definitions
- CHECK constraints
- Proposed indexes (including the partial unique index for one-approved-BOM-per-product)
- RLS policy intent (which roles can SELECT / INSERT / UPDATE / DELETE)
- `created_at` / `created_by` / `updated_at` / `updated_by` on all business tables

**The database schema, once written, is the next artifact requiring review before any migration is created.**

---

*End of Definitive Implementation Blueprint v1.0*  
*This document supersedes all prior architecture documentation for this platform.*  
*The next version of this document is issued only when a fundamental architectural decision changes.*
