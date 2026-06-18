# Known Limitations

Current as of sprint commit a3c26c3 + morning run.

---

## Requires Live Supabase to Function

The following features are implemented but cannot be tested without a running Supabase instance:

| Feature | Status | Notes |
|---|---|---|
| Authentication (login/logout) | ✅ Code complete | Requires Supabase Auth |
| SKU CRUD | ✅ Code complete | Requires DB + RLS |
| BOM creation and versioning | ✅ Code complete | Requires DB + RLS |
| Cost calculation engine | ✅ Code complete | Tested with mocks; requires DB for end-to-end |
| Inventory valuation | ✅ Code complete | Requires DB snapshot |
| Audit log | ✅ Code complete | Requires DB trigger setup |
| Validation center | ✅ Code complete | Requires DB |

---

## Not Yet Implemented

| Feature | Priority | Notes |
|---|---|---|
| Password reset / forgot password | High | Auth flow needs `/api/auth/reset-password` |
| Email confirmation flow | High | Supabase handles this but redirect URL needs config |
| User role management | Medium | Schema exists (`profiles.role`); no admin UI |
| BOM version approval workflow | Medium | Status transitions exist; no approval UI |
| Manual cost adjustment UI | Medium | API exists; no page yet |
| Rule exception request UI | Medium | API exists; no page yet |
| Export (Excel/CSV) | Low | Not yet planned |
| Multi-currency conversion | Low | Currency stored but no conversion logic |
| Scheduled validation runs | Low | `run_type=scheduled` accepted but no scheduler |

---

## UI Limitations

- All pages are functional but unstyled beyond minimal inline CSS
- No mobile layout (desktop-only for pilot)
- No pagination on SKU/BOM lists (relies on API limit defaults)
- No real-time updates (manual refresh required after changes)
- Trace viewer requires manual UUID paste (no link from calculation result)

---

## Known Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| RLS policy gap allows cross-tenant read | Low | Critical | Migration review shows RLS on all tables |
| Cost engine returns wrong result for complex multi-level BOM | Low | High | 208 tests including 5-level deep BOM scenarios |
| Seed data conflicts with existing org data | Low | Medium | All inserts use `ON CONFLICT (id) DO NOTHING` |
| Service role key exposure | Very Low | Critical | `npm run check-env` verifies no NEXT_PUBLIC_* leak |
| Cycle in BOM causes infinite loop | Very Low | High | Cycle detection in Stage 01 of cost engine |

---

## Architecture Decisions Not Yet Finalized

- **Report snapshot format**: Currently using `calculation_traces` table directly. A report snapshot table (planned in ADR-107) would freeze the display of a valuation result for audit.
- **Multi-org RBAC**: Current RLS uses `auth_org_id()` function. Role-based restrictions (admin vs viewer) are not enforced at DB level yet.
- **Currency strategy**: All costs stored in the `currency` field of the cost set. No conversion at query time. Cross-currency comparisons will need a conversion layer.

---

## What's Fully Working (Tested)

- Pure cost engine logic: 208 unit tests, all passing
- BOM cycle detection: DFS with 3-color marking
- Rule condition evaluation: AND within group, OR across groups
- Exception scope matching: sku, family, subfamily
- Inventory valuation aggregation: global, per-warehouse, per-family/subfamily
- All 14 validation rules: coded and tested (21 + 21 + 19 = 61 validation tests)
- API routes: Zod validation, 400/401/404/422/500 status codes
- Auth middleware: redirects unauthenticated users to /login
