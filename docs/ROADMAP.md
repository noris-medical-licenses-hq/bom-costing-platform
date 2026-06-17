# BOM Costing Platform — Roadmap

**Last updated:** 2026-06-17

---

## Phase 0 — Foundation (current)

**Goal:** Working repository scaffold, documented architecture, team alignment.  
**Deliverables:**
- [x] Repository created
- [x] Folder structure (`/docs`, `/database`, `/backend`, `/frontend`, `/tests`)
- [x] Architecture documentation (PROJECT_SPECIFICATION, DATA_MODEL, ARCHITECTURE, DECISIONS, ROADMAP)
- [ ] `.gitignore`, `README.md`
- [ ] Supabase project provisioned (dev + prod)
- [ ] `supabase init` and local dev environment working
- [ ] CI pipeline skeleton (GitHub Actions: lint + type-check on PR)

---

## Phase 1 — Database & Auth (Week 1–2)

**Goal:** Schema live, auth working, RLS enforced.  
**Deliverables:**
- [ ] All core migrations written and applied to dev Supabase
- [ ] RLS policies for all tables (organization-scoped)
- [ ] Audit log trigger implemented
- [ ] `supabase gen types typescript` wired into build
- [ ] Login / signup UI (Supabase Auth)
- [ ] Profile creation on first login
- [ ] Role-based access confirmed with integration tests

---

## Phase 2 — BOM Management (Week 3–5)

**Goal:** Users can create and edit multi-level BOMs.  
**Deliverables:**
- [ ] Product CRUD (list, create, edit, archive)
- [ ] Component / part master CRUD
- [ ] BOM create / version / edit
- [ ] BOM line editor (add, remove, reorder, nest sub-assemblies)
- [ ] BOM version history view

---

## Phase 3 — Costing (Week 6–8)

**Goal:** Full cost roll-up with supplier pricing.  
**Deliverables:**
- [ ] Supplier management (list, create, qualify)
- [ ] Supplier price entry with effective dates
- [ ] Cost roll-up engine (`backend/services/costRollup.ts`)
- [ ] Cost scenario builder (target / quote / actual)
- [ ] Scenario comparison view (side-by-side)
- [ ] Cost breakdown export (PDF + CSV)

---

## Phase 4 — Approval Workflow & Reporting (Week 9–10)

**Goal:** Approver role can freeze and sign off BOMs.  
**Deliverables:**
- [ ] BOM approval flow (draft → under review → approved → archived)
- [ ] Approval notifications (email via Supabase Edge Function)
- [ ] Frozen BOM snapshots (read-only after approval)
- [ ] Dashboard: cost trends, BOM count, pending approvals
- [ ] Audit log viewer for admins

---

## Phase 5 — Hardening & Launch (Week 11–12)

**Goal:** Production-ready, secure, tested.  
**Deliverables:**
- [ ] End-to-end tests (Playwright) for critical paths
- [ ] Performance test: 500-component BOM roll-up < 2s
- [ ] Security review (RLS, service_role exposure, input validation)
- [ ] Error monitoring (Sentry or similar)
- [ ] Production Supabase environment and Vercel deployment
- [ ] User onboarding documentation

---

## Future Considerations (Post-V1)

| Item | Notes |
|------|-------|
| ERP integration | Export/import via CSV initially; REST API for SAP/Infor later |
| Multi-currency | Per-BOM currency with conversion rates |
| ECO workflow | Engineering Change Orders linked to BOM versions |
| PLM/CAD sync | Read-only import from PLM systems |
| Mobile | Progressive web app (PWA) before native |
