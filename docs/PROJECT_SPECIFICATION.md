# BOM Costing Platform — Project Specification

**Owner:** Noris Medical  
**Repository:** noris-medical-licenses-hq/bom-costing-platform  
**Status:** Foundation — pre-development  
**Last updated:** 2026-06-17

---

## 1. Problem Statement

Medical device manufacturers must maintain accurate, auditable Bills of Materials (BOMs) with real-time costing to support product pricing decisions, regulatory submissions, and supplier negotiations. Manual spreadsheet-based BOM costing is error-prone, lacks version control, and cannot enforce validation rules or approval workflows.

## 2. Product Vision

A web-based BOM Costing Platform that allows engineering, procurement, and finance teams to collaboratively build, version, and cost Bills of Materials for medical devices. The platform enforces cost roll-up rules, tracks supplier pricing history, and produces audit-ready cost reports.

## 3. Core Features (MVP)

| # | Feature | Priority |
|---|---------|----------|
| 1 | Product & BOM management (create, edit, version BOMs) | Must have |
| 2 | Component / part master with unit cost | Must have |
| 3 | Multi-level BOM cost roll-up (material + labor + overhead) | Must have |
| 4 | Supplier pricing per component (with effective dates) | Must have |
| 5 | Cost scenario comparison (quote vs. actual vs. target) | Must have |
| 6 | Export cost breakdown to PDF / CSV | Must have |
| 7 | User roles: Viewer / Editor / Approver / Admin | Must have |
| 8 | BOM version history and diff view | Should have |
| 9 | Supplier management module | Should have |
| 10 | Currency conversion (multi-currency BOMs) | Should have |
| 11 | ECO (Engineering Change Order) workflow | Could have |
| 12 | ERP integration (SAP / Infor) via API | Could have |

## 4. Users

| Role | Responsibilities |
|------|-----------------|
| Engineer | Creates and edits BOM structure |
| Cost Analyst | Enters and maintains component costs |
| Procurement | Manages supplier pricing |
| Finance / Management | Reviews cost reports, approves scenarios |
| Admin | Manages users, permissions, system config |

## 5. Non-Functional Requirements

- **Traceability:** Every cost change is logged with user, timestamp, and previous value.
- **Audit readiness:** BOM snapshots can be frozen and signed off for regulatory submissions.
- **Performance:** BOM roll-up for a 500-component BOM must complete in < 2 seconds.
- **Security:** Row-level security enforced at the database layer. No public data exposure.
- **Availability:** Target 99.5% uptime; non-critical downtime acceptable during off-hours.

## 6. Out of Scope (V1)

- ERP write-back / bi-directional sync
- Real-time market pricing feeds
- Direct CAD/PLM integration
- Mobile native app
