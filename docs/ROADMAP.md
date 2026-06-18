# BOM Costing Platform — Roadmap

**Last updated:** 2026-06-18

---

## Phase 0 — Foundation ✅ COMPLETE

**Goal:** Working repository scaffold, documented architecture, team alignment.  
**Deliverables:**
- [x] Repository created
- [x] Folder structure (`/docs`, `/database`, `/backend`, `/frontend`, `/tests`)
- [x] Architecture documentation (PROJECT_SPECIFICATION, DATA_MODEL, ARCHITECTURE, DECISIONS, ROADMAP, BLUEPRINT)
- [x] `.gitignore`, `README.md`
- [x] DATA_MODEL.md v2.0 — complete 32-table logical schema
- [x] All 10 open questions resolved (OQ-01 through OQ-10) — see DECISIONS.md
- [ ] Supabase project provisioned (dev + prod)
- [ ] `supabase init` and local dev environment working
- [ ] CI pipeline skeleton (GitHub Actions: lint + type-check on PR)

---

## Phase 1 — Database & Auth (Week 1–2)

**Goal:** Schema live, auth working, RLS enforced.  
**Deliverables:**
- [x] All 23 SQL migrations written (M-001 through M-023) — `database/migrations/`
- [x] RLS policies for all 32 tables (organization-scoped) — M-021
- [x] Audit log trigger on all business tables — M-022
- [x] Performance indexes for all hot-path queries — M-023
- [ ] Migrations applied to dev Supabase (`supabase db push`)
- [ ] `supabase gen types typescript` wired into build
- [ ] Login / signup UI (Supabase Auth)
- [ ] Profile creation on first login (via Supabase Auth hook)
- [ ] Role-based access confirmed with integration tests

---

## Phase 2 — BOM Management (Week 3–5)

**Goal:** Users can create and edit multi-level BOMs.  
**Deliverables:**
- [ ] SKU CRUD (list, create, edit, archive) — families, subfamilies, classification
- [ ] Virtual Component library (list, create, edit)
- [ ] BOM create / version / edit
- [ ] BOM line editor (add, remove, reorder, nest sub-assemblies)
- [ ] BOM cycle detection (pre-write validation, ADR-106)
- [ ] BOM structural validation (V-BOM-001 through V-BOM-007)
- [ ] BOM version approval workflow (draft → approved)
- [ ] BOM version history view

---

## Phase 3 — Costing (Week 6–9)

**Goal:** Full cost roll-up with explainability and rule engine.  
**Deliverables:**
- [ ] Cost Set management (create, manage, activate)
- [ ] Cost Item management (within cost sets, all scope types)
- [ ] Cost Calculation Engine (all 10 pipeline stages, BLUEPRINT §5)
- [ ] Cost Rule management (create, activate, test before activation)
- [ ] Rule Exception (request + approve workflow)
- [ ] Calculation Trace (write + read + full drill-down UI)
- [ ] CSV export of cost breakdown
- [ ] Validation engine (all categories V-BOM, V-SKU, V-COST, V-RULE)

---

## Phase 4 — Inventory Valuation (Week 10–13)

**Goal:** Inventory snapshots valued against Cost Sets with historical reproducibility.  
**Deliverables:**
- [ ] Site and Warehouse management
- [ ] Inventory Snapshot create and line entry
- [ ] Snapshot valuation (cost engine integration, per-line traces)
- [ ] Snapshot approval workflow (with cost_set_snapshot freeze, ADR-103)
- [ ] Historical snapshot navigation
- [ ] Valuation report (by warehouse, by family, CSV export)
- [ ] Supplier and Supplier Price management (UI for Phase 2 schema tables)

---

## Phase 5 — Hardening & Launch (Week 14–16)

**Goal:** Production-ready, secure, tested.  
**Deliverables:**
- [ ] End-to-end tests (Playwright) for critical paths
- [ ] Performance test: 500-component BOM roll-up < 2s
- [ ] Security review (RLS, service_role exposure, input validation)
- [ ] Error monitoring (Sentry or similar)
- [ ] Production Supabase environment and Vercel deployment
- [ ] User onboarding documentation
- [ ] Audit log viewer for admin role (filter, diff, export)

---

## Future Considerations (Post-V1)

| Item | Notes |
|------|-------|
| Multi-currency / FX rates | Add `exchange_rates` table; schema already accommodates without migration |
| ERP integration | CSV import initially; REST API for SAP/Infor later |
| ECO workflow | Engineering Change Orders linked to BOM versions |
| BOM diff view | Side-by-side version comparison |
| Scenario comparison | Same BOM under Cost Set A vs B |
| Supplier qualification workflow | Procurement compliance |
| Email / notification system | Approval workflow UX |
| PLM/CAD sync | Read-only import from PLM systems |
| AI anomaly detection | Reads existing tables; no schema changes needed |
| Mobile PWA | Progressive web app after desktop V1 |
