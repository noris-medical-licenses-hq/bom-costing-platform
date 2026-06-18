# Seed Data Coverage

Documents the demo dataset in `scripts/seed.sql` — what is seeded, what demo scenarios it enables, and what gaps exist.

---

## Seeded Records

### Families (4)

| ID suffix | Code | Name |
|---|---|---|
| …001 | WIN | Windows |
| …002 | DOR | Doors |
| …003 | PRF | Profiles |
| …004 | GLS | Glass |

### Subfamilies (6)

| ID suffix | Family | Code | Name |
|---|---|---|---|
| …001 | PRF | PVC | PVC Profiles |
| …002 | PRF | ALU | Aluminum Profiles |
| …003 | WIN | DBL | Double Glazed |
| …004 | WIN | TRP | Triple Glazed |
| …005 | GLS | CLR | Clear Glass |
| …006 | GLS | LAM | Laminated Glass |

### Suppliers (4)

| ID suffix | Code | Name | Country |
|---|---|---|---|
| …001 | REHAU-DE | REHAU GmbH | DE |
| …002 | SAINT-FR | Saint-Gobain Glass | FR |
| …003 | TREMCO-NL | Tremco CPG Netherlands | NL |
| …004 | EDGETECH | Edgetech Europe GmbH | DE |

All suppliers are `status = 'active'`. None are set `is_qualified = true` (default false). This means V-SKU-003 (unqualified supplier sourcing regulated SKU) will fire for any regulated SKU using these suppliers.

### SKUs (10)

| ID suffix | Part Number | Type | Make/Buy | UoM |
|---|---|---|---|---|
| …001 | PRF-PVC-080 | purchased_part | buy | lm |
| …002 | PRF-PVC-060 | purchased_part | buy | lm |
| …003 | GLS-DBL-4-16-4 | purchased_part | buy | m2 |
| …004 | GLS-TRP-4-12-4-12-4 | purchased_part | buy | m2 |
| …005 | SEL-EPDM-MAIN | purchased_part | buy | lm |
| …006 | SEL-EPDM-GLAZ | purchased_part | buy | lm |
| …007 | SPC-WARM-EDGE | purchased_part | buy | lm |
| …010 | FRM-WND-080-DBL | sub_assembly | make | pcs |
| …020 | WND-CASEMENT-080-DBL | finished_good | make | pcs |
| …021 | WND-CASEMENT-080-TRP | finished_good | make | pcs |

Notes:
- All SKUs are `status = 'active'`
- No SKU has `is_regulated = true` (safe for demo — avoids V-SKU-003 with unqualified suppliers)
- No `is_optional` or `scrap_rate` on bom_lines (these do not exist in the schema)

### Supplier Prices (7)

All 7 purchased-part SKUs have one active supplier price (EUR, open-ended). The sub-assembly and finished goods have no supplier prices (they are make items).

| SKU | Supplier | Price (EUR) | Effective From |
|---|---|---|---|
| PRF-PVC-080 | REHAU | 3.20/lm | 2024-01-01 |
| PRF-PVC-060 | REHAU | 2.60/lm | 2024-01-01 |
| GLS-DBL-4-16-4 | Saint-Gobain | 28.50/m2 | 2024-01-01 |
| GLS-TRP-4-12-4-12-4 | Saint-Gobain | 42.00/m2 | 2024-01-01 |
| SEL-EPDM-MAIN | Tremco | 0.45/lm | 2024-01-01 |
| SEL-EPDM-GLAZ | Tremco | 0.38/lm | 2024-01-01 |
| SPC-WARM-EDGE | Edgetech | 1.20/lm | 2024-01-01 |

### BOMs and BOM Versions (3 each)

| BOM | For SKU | Version | Status | is_locked |
|---|---|---|---|---|
| bom-…001 | FRM-WND-080-DBL | v1 | approved | true |
| bom-…002 | WND-CASEMENT-080-DBL | v1 | approved | true |
| bom-…003 | WND-CASEMENT-080-TRP | v1 | approved | true |

### BOM Lines (10 across 3 versions)

**Frame sub-assembly (bmv-…001):**
| Line | SKU | Qty | UoM |
|---|---|---|---|
| bln-…101 | PRF-PVC-080 | 4.4 | lm |
| bln-…102 | PRF-PVC-060 | 0.8 | lm |
| bln-…103 | SEL-EPDM-MAIN | 3.2 | lm |
| bln-…104 | SEL-EPDM-GLAZ | 3.2 | lm |

**Double-glazed window (bmv-…002):**
| Line | SKU | Qty | UoM |
|---|---|---|---|
| bln-…201 | FRM-WND-080-DBL (sub-asm) | 1 | pcs |
| bln-…202 | GLS-DBL-4-16-4 | 1.08 | m2 |
| bln-…203 | SPC-WARM-EDGE | 3.4 | lm |

**Triple-glazed window (bmv-…003):**
| Line | SKU | Qty | UoM |
|---|---|---|---|
| bln-…301 | FRM-WND-080-DBL (sub-asm) | 1 | pcs |
| bln-…302 | GLS-TRP-4-12-4-12-4 | 1.08 | m2 |
| bln-…303 | SPC-WARM-EDGE | 6.8 | lm |

### Sites and Warehouses

| Site | Code | Country | Warehouses |
|---|---|---|---|
| Berlin Plant | BERLIN | DE | BER-WH1 (raw_materials), BER-WH2 (finished_goods) |
| Munich Plant | MUNICH | DE | MUN-WH1 (work_in_progress) |

### Cost Sets (3)

| ID suffix | Code | Type | Currency | Default |
|---|---|---|---|---|
| …001 | BERLIN-2024 | standard | EUR | true |
| …002 | MUNICH-2024 | standard | EUR | false |
| …003 | PROJECT-X | quote | EUR | false |

### Cost Items (8)

**Berlin 2024 (5 items):**
| Item | Type | Scope | Value |
|---|---|---|---|
| cit-…001 | overhead_pct | global | 12% |
| cit-…002 | overhead_pct | family: Windows | 8% |
| cit-…003 | material_price | sku: PRF-PVC-080 | 3.10 EUR/lm |
| cit-…004 | material_price | sku: GLS-DBL | 26.80 EUR/m2 |
| cit-…005 | material_price | sku: GLS-TRP | 39.50 EUR/m2 |

**Munich 2024 (3 items):**
| Item | Type | Scope | Value |
|---|---|---|---|
| cit-…011 | overhead_pct | global | 14% |
| cit-…012 | material_price | sku: PRF-PVC-080 | 3.25 EUR/lm |
| cit-…013 | material_price | sku: GLS-DBL | 27.50 EUR/m2 |

Note: Project X cost set has no cost items — useful for testing "missing cost" validation scenario.

### Cost Rules (3)

| Rule | Name | Priority | Active |
|---|---|---|---|
| rul-…001 | Window Family Premium | 10 | true |
| rul-…002 | Triple Glaze Cap | 20 | true |
| rul-…003 | Discontinued SKU Exclude | 99 | false |

Rule 1: Add 5% for all Window-family SKUs.
Rule 2: Cap triple-glazed units at 50 EUR/m2 (condition: purchased_part AND subfamily = LAM).
Rule 3: Inactive — demo of disabled rule.

---

## Demo Scenarios Supported

| # | Scenario | What to use |
|---|---|---|
| 1 | Calculate double-glazed window | BOM bom-…002, Cost Set BERLIN-2024 |
| 2 | Calculate triple-glazed window with cap rule | BOM bom-…003, Cost Set BERLIN-2024 — Rule 2 fires |
| 3 | Berlin vs Munich cost comparison | Same BOM, Cost Sets BERLIN-2024 vs MUNICH-2024 |
| 4 | Validation with clean data | All rules pass — good for "green board" demo |
| 5 | Inventory snapshot valuation | Sites BERLIN / MUNICH, warehouses BER-WH1 |
| 6 | Audit log inspection | Any of the above actions produces audit log entries |

---

## Validation Scenarios Supported

| Rule | Expected Result | Notes |
|---|---|---|
| V-BOM-001 (missing BOM for make SKU) | Pass | All make SKUs have BOMs |
| V-BOM-002 (buy SKU has BOM) | Pass | Buy SKUs have no BOMs |
| V-BOM-003 (empty BOM) | Pass | All BOMs have lines |
| V-BOM-005 (BOM cycle) | Pass | No cycle in seed data |
| V-COST-001 (no active cost set) | Pass | Berlin 2024 is active |
| V-SKU-001 (inactive SKU in BOM) | Pass | All SKUs are active |
| V-SKU-003 (unqualified supplier for regulated SKU) | Pass | No regulated SKUs seeded |
| V-SKU-004 (no cost for SKU) | Mixed | SEL-EPDM-GLAZ, PRF-PVC-060, SPC-WARM-EDGE have no cost items — rely on supplier prices |

---

## Known Gaps in Seed Data

| Gap | Impact | Workaround |
|---|---|---|
| No `is_regulated = true` SKUs | Cannot demo V-SKU-003 (unqualified supplier) | Add manually after seed |
| No `discontinued` or `archived` SKUs in BOMs | Cannot demo V-SKU-001 (inactive SKU in BOM) | Change a SKU status after seed |
| No BOM with cycle | Cannot demo cycle detection finding | Create manually in BOM UI |
| No inventory snapshot lines | Inventory page shows empty until snapshot is created | Create snapshot via UI after seed |
| No cost items in Project X | Cannot demo multi-cost-set calculation | Add cost items manually after seed |
| No manual_cost_adjustments | Cannot demo Priority 0 override | Add manually after seed |
| No rule exceptions | Cannot demo exception suppression | Add manually after seed |
| Suppliers not `is_qualified` | V-SKU-003 never fires against seeded SKUs | Expected — regulated devices are manual setup |

---

## Seed Prerequisites

Before running `npm run apply-seed`:
1. Supabase project must exist and migrations (M-001 through M-023) must be applied
2. An organization must exist in the `organizations` table — copy its UUID as `ORG_ID`
3. A user must have signed up and their profile must exist in `profiles` — copy its UUID as `USER_ID`
4. The profile's `organization_id` must match `ORG_ID`

The seed does not create the organization or user profile. Those are created by:
- Organization: manually via Supabase SQL editor or service-role API call
- User profile: automatically via Supabase Auth webhook / profile trigger

## Seed Idempotency

All inserts use `ON CONFLICT (id) DO NOTHING`. Safe to run multiple times. Does not update existing rows.
