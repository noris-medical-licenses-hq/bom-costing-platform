# BOM Costing Platform — Demo Walkthrough
## Noris Medical | Site: bom-costing-platform

---

## Pre-Demo Setup (5 min)

### 1. Load seed data
```bash
# Replace placeholders with real values:
psql "$SUPABASE_DB_URL" \
  -v org_id="<your-org-uuid>" \
  -v user_id="<your-user-uuid>" \
  -f scripts/seed.sql
```
This inserts 4 product families, 10 SKUs, 3 multi-level BOMs, 2 sites, 3 warehouses,
3 cost sets, and 3 pricing rules — all idempotent (safe to re-run).

### 2. Verify data is loaded
Open the app, navigate to SKU Management → you should see ~10 SKUs including
`WND-FRAME-PVC-001`, `WND-GLASS-CLR-001`, `WND-ASSY-001`.

---

## Demo Script (20 min)

### Scene 1 — Dashboard (1 min)
**What to show:** The 7-card dashboard gives a bird's-eye view.
- Point out: SKU Management, BOM Explorer, Validation Center, Cost Calculation,
  Inventory Valuation, Trace Viewer, Audit Log
- Say: "Every step of the costing process has a dedicated workspace."

---

### Scene 2 — SKU Management (3 min)
**What to show:** Hierarchy → BOM structure → cost readiness

1. Open `/skus` — show the SKU list
2. Filter by Family: **WINDOW** → 4 SKUs appear
3. Note the item types: `purchased_part` (frame, glass, seal) vs `finished_good` (window assembly)
4. Say: "Make/Buy flag drives which SKUs need a BOM vs a supplier price."

---

### Scene 3 — BOM Explorer (4 min)
**What to show:** Multi-level structure for the window assembly

1. Open `/boms`
2. Select BOM for `WND-ASSY-001` (Window Assembly 80mm PVC)
3. Expand the tree:
   - L1: Window Assembly (qty 1)
   - L2: Frame PVC 80mm (qty 2) + Glass Clear 4mm (qty 1) + Seal EPDM (qty 4)
4. Select the Frame BOM → it has its own sub-components
5. Say: "The system handles arbitrary nesting depth with cycle detection built in."

---

### Scene 4 — Validation Center (3 min)
**What to show:** Pre-costing health check

1. Open `/validation`
2. Select Org and click **Run Validation**
3. Show the results panel — rules that pass vs warnings
4. Key rules to highlight:
   - `V-BOM-001`: BOMs have at least one line ✓
   - `V-SKU-001`: SKUs have consistent family/subfamily ✓
   - `V-COST-001`: Cost items have valid effective dates ✓
5. Say: "14 validation rules run in parallel. Problems caught here never reach the
   cost engine."

---

### Scene 5 — Cost Sets (2 min)
**What to show:** Site-specific pricing

1. Open `/cost-sets`
2. Show **Site A — Berlin** cost set with its items
3. Switch to **Site B — Munich** — different markup structure
4. Say: "Each site can have independent cost sets with their own currency and validity
   windows. Project-level sets can override site defaults."

---

### Scene 6 — Cost Calculation (3 min)
**What to show:** End-to-end calculation with trace

1. Open `/inventory` (or trigger via API: `POST /api/calculate`)
2. Select a BOM version + Cost Set, click Calculate
3. Show the result: total unit cost, currency, warnings count
4. Copy the **Trace ID** from the result
5. Navigate to `/traces`, paste the Trace ID, click **Load Trace**

---

### Scene 7 — Trace Viewer (3 min)
**What to show:** Full explainability

1. Trace header: total cost, duration, warning count
2. BOM breakdown table:
   - Each line: depth, SKU, qty, resolved unit cost, line total
   - Color-coded source badges: `sku` (blue), `supplier_price` (green), `none` (red)
3. Rule evaluations table:
   - Which rules were evaluated, which conditions passed/failed
   - Before/after cost values, delta amount
4. Say: "Any auditor or engineer can trace exactly why this SKU costs what it does —
   down to the specific rule that applied the markup."

---

### Scene 8 — Audit Log (1 min)
**What to show:** Immutable event trail

1. Open `/audit`
2. Filter by `event_type: calculate` — shows all calculations
3. Expand a row → full metadata snapshot including user, timestamp, parameters
4. Say: "Every calculate, validate, approve, and archive event is logged with
   full context. Nothing can be changed without a trail."

---

## Key Talking Points

| Capability | Evidence |
|---|---|
| Multi-level BOM costing | 3-level window BOM with automatic rollup |
| Site-specific pricing | Berlin vs Munich cost sets with different rates |
| Rule-based adjustments | Family markup rule with cap, visible in trace |
| Validation before costing | 14 rules, 118 automated tests |
| Full explainability | Trace viewer shows per-line source and per-rule delta |
| Audit trail | Every event logged with metadata |
| Type-safe codebase | TypeScript strict, 0 type errors at build |

---

## Demo Checklist

- [ ] Seed data loaded (`psql ... -f scripts/seed.sql`)
- [ ] App is running (`npm run dev` or deployed)
- [ ] At least one calculation has been run (to have a Trace ID ready)
- [ ] Browser open at `/` (Dashboard)
- [ ] Trace ID copied and ready to paste into Trace Viewer
- [ ] Backup: screenshots of each view saved in `docs/screenshots/`

---

## Common Questions

**"What happens with missing costs?"**
The engine continues but flags the line with `has_missing_cost = true`. The trace
shows a red `none` badge. Validation rule V-BOM-004 catches this before costing.

**"How are rules prioritized?"**
Rules have a `priority` integer. Lower number wins. Within the same priority,
rules are applied in order. The trace shows every rule that was evaluated, not
just the one that applied.

**"Can we have exceptions per project?"**
Yes. `rule_exceptions` table supports scope types: `sku`, `family`, `subfamily`,
`supplier`, `warehouse`, `project`. An approved exception suppresses the rule
and records which exception overrode it in the trace.

**"What's the database?"**
Supabase (PostgreSQL) with Row-Level Security on all tables. Service role key
is only used server-side — never exposed to the browser.
