# BOM Costing Platform — Project Specification

**Owner:** Noris Medical  
**Repository:** noris-medical-licenses-hq/bom-costing-platform  
**Status:** Phase 1 — Database implemented, pending Supabase provisioning  
**Last updated:** 2026-06-18

---

## 1. Problem Statement

Medical device manufacturers must maintain accurate, auditable Bills of Materials (BOMs) with real-time costing to support product pricing decisions, regulatory submissions, and supplier negotiations. Manual spreadsheet-based BOM costing is error-prone, lacks version control, and cannot enforce validation rules or approval workflows.

## 2. Product Vision

A web-based BOM Costing Platform that allows engineering, procurement, and finance teams to collaboratively build, version, and cost Bills of Materials for medical devices. The platform enforces a 10-stage cost roll-up pipeline with explainability traces, tracks supplier pricing history, and produces audit-ready cost reports.

## 3. Core Features (MVP Scope)

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| 1 | SKU / part master with classification (families, subfamilies) | Must have | Unified SKU model (ADR-101) |
| 2 | Multi-level BOM create, edit, version | Must have | Adjacency list tree, cycle detection |
| 3 | Cost Sets — org-wide cost contexts | Must have | Replaces per-BOM scenarios (ADR-102) |
| 4 | 6-level cost precedence roll-up | Must have | SKU > SubFamily > Family > Supplier/Country > Global > supplier_price |
| 5 | Cost rule engine with exceptions | Must have | Fires after cost resolution (ADR-107) |
| 6 | Manual cost adjustment (Priority 0 override) | Must have | Requires approval |
| 7 | Full calculation trace / explainability | Must have | 5-table trace model, ADR-104 |
| 8 | Virtual Components (packaging, CE marking, scrap) | Must have | Fixed or percentage cost types |
| 9 | Inventory snapshot valuation | Must have | Frozen cost at approval (ADR-103) |
| 10 | Validation engine (BOM, SKU, cost, rule checks) | Must have | V-BOM-001 through V-INV-004 |
| 11 | CSV export of cost breakdown | Must have | PDF: Phase 2 |
| 12 | User roles and role-based access | Must have | 6 roles (see §4) |
| 13 | Audit log — full history of all mutations | Must have | DB trigger on 23 tables, ADR-005 |
| 14 | BOM version approval workflow | Should have | Draft → Approved |
| 15 | Supplier pricing history | Should have | Schema in MVP, UI in Phase 2 |
| 16 | BOM version history view | Should have | Read-only history |
| 17 | BOM diff view (side-by-side comparison) | Could have | Phase 2 |
| 18 | Cost Set comparison (same BOM, two Cost Sets) | Could have | Phase 2 |
| 19 | ERP integration (SAP / Infor) via API | Could have | Phase 2 |

## 4. Users and Roles

| Role | Database value | Responsibilities |
|------|----------------|-----------------|
| Viewer | `viewer` | Read-only access to BOMs, costs, and reports |
| Editor | `editor` | Creates and edits BOM structure and SKUs |
| Cost Analyst | `cost_analyst` | Enters and maintains component costs and Cost Sets |
| Procurement | `procurement` | Manages supplier pricing and sourcing data |
| Approver | `approver` | Approves BOM versions, cost adjustments, rule exceptions; reads audit log |
| Admin | `admin` | Manages users, permissions, system config; full audit log access |

## 5. Non-Functional Requirements

- **Traceability:** Every cost change is logged with user, timestamp, and previous value.
- **Audit readiness:** Inventory snapshots can be frozen and signed off for regulatory submissions. Calculation traces provide full explainability.
- **Performance:** BOM cost roll-up for a 500-component BOM must complete in < 2 seconds.
- **Security:** Row-level security enforced at the database layer. No public data exposure. `service_role` key never in client bundle.
- **Availability:** Target 99.5% uptime; non-critical downtime acceptable during off-hours.
- **Single-currency MVP:** Multi-currency is Phase 2 (OQ-01). Cost values stored in the organization's base currency.

## 6. Out of Scope (V1 / MVP)

- ERP write-back / bi-directional sync
- Real-time market pricing feeds
- Direct CAD/PLM integration
- Mobile native app
- Multi-currency / FX rates
- BOM diff view (side-by-side comparison)
- AI anomaly detection
- ECO (Engineering Change Order) workflow
- Project-scoped inventory (schema present, UI deferred)
- PDF export (CSV only in MVP)

## 7. Key Technical Decisions

| Decision | ADR | Summary |
|----------|-----|---------|
| Unified SKU model | ADR-101 | Single `skus` table replaces products + components |
| Cost Sets (org-wide) | ADR-102 | Replaces per-BOM cost scenarios |
| Frozen cost at approval | ADR-103 | `unit_cost` written as concrete number at approval |
| Immutable calculation trace | ADR-104 | Engine writes, UI reads — never recalculated |
| Validation separate from engine | ADR-105 | Runs independently; engine calls it as Stage 2 |
| Cycle detection at write time | ADR-106 | BOM must never contain a cycle |
| Rule engine on resolved costs | ADR-107 | Rules fire after cost hierarchy resolves unit cost |
