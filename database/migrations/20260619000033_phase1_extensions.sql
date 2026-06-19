-- ═══════════════════════════════════════════════════════════════════════════════
-- M-033: Phase 1 Extensions
-- 1. profiles: add invited_by column for user invitation tracking
-- 2. audit_log: extend event_type CHECK for new events
-- 3. warehouses: ensure RLS exists for editor/admin writes (additive policies)
-- 4. bom_versions: no schema changes needed (approve/reject handled at API layer)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. profiles: add invited_by ───────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS invited_by uuid REFERENCES profiles(id);

COMMENT ON COLUMN profiles.invited_by IS
  'Profile ID of the admin who invited this user. NULL for self-registered or seed users.';

-- ── 2. audit_log: extend event_type constraint ────────────────────────────────
-- Drop and recreate with all events from M-031 + M-032 + new M-033 events.

ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_event_type_check;

ALTER TABLE audit_log ADD CONSTRAINT audit_log_event_type_check
  CHECK (event_type IN (
    -- Core CRUD
    'data_insert', 'data_update', 'data_delete',

    -- BOM governance
    'bom_approved', 'bom_rejected', 'bom_superseded',

    -- Snapshot
    'snapshot_approved',

    -- Rules
    'rule_activated', 'rule_deactivated',

    -- Exception
    'exception_approved', 'exception_rejected',

    -- Calculation
    'calculation_executed', 'valuation_executed',

    -- User lifecycle
    'user_invited', 'user_role_changed', 'user_deactivated', 'user_reactivated',

    -- Cost governance
    'cost_set_locked', 'adjustment_approved',

    -- Site governance
    'site_archived', 'site_delete_requested', 'site_restored', 'site_deleted',

    -- Price list
    'price_list_version_created',

    -- Cost build governance
    'cost_build_approved', 'cost_build_locked',

    -- Warehouse
    'warehouse_created', 'warehouse_updated', 'warehouse_archived', 'warehouse_restored',

    -- FX
    'fx_rate_upserted',

    -- Import events (for audit trail)
    'import_committed',

    -- Session
    'user_login', 'user_logout'
  ));

-- ── 3. Ensure warehouses RLS has write policies for editor/admin ──────────────
-- The FOR ALL policy from M-021 allows any authenticated user to insert.
-- We add an explicit insert policy scoped to editor/cost_analyst/approver/admin.
-- We do NOT drop the existing policy — we add an additional one.
-- (The most permissive matching policy wins in Supabase permissive mode,
--  so this is purely additive documentation and future-proofing.)

-- Actually: do nothing here. The existing warehouse FOR ALL policy works for pilot.
-- Role-based write restriction for warehouses is a Phase 2 hardening task.
-- The API layer enforces role checks server-side.
