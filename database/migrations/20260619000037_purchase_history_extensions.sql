-- M-037: Purchase history extensions for site_cost_builds
-- 1. Add base_currency: cost set reporting currency; AVERAGE_PURCHASE filters by this
-- 2. Add average_purchase_lookback_days: frozen into snapshot for reproducibility
-- 3. Extend audit_log.event_type with purchase_history_imported

-- ── 1. site_cost_builds: base_currency ───────────────────────────────────────
-- The cost set created by this build uses this currency.
-- AVERAGE_PURCHASE filters purchase_history WHERE currency = base_currency.

ALTER TABLE site_cost_builds
  ADD COLUMN IF NOT EXISTS base_currency text NOT NULL DEFAULT 'EUR';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'site_cost_builds_base_currency_check'
  ) THEN
    ALTER TABLE site_cost_builds
      ADD CONSTRAINT site_cost_builds_base_currency_check
      CHECK (char_length(base_currency) = 3);
  END IF;
END $$;

-- ── 2. site_cost_builds: average_purchase_lookback_days ─────────────────────
-- Lookback window for AVERAGE_PURCHASE. Frozen into parameters_snapshot at
-- build time so the result is reproducible regardless of when it's re-queried.

ALTER TABLE site_cost_builds
  ADD COLUMN IF NOT EXISTS average_purchase_lookback_days integer NOT NULL DEFAULT 365;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'site_cost_builds_lookback_check'
  ) THEN
    ALTER TABLE site_cost_builds
      ADD CONSTRAINT site_cost_builds_lookback_check
      CHECK (average_purchase_lookback_days IN (30, 90, 180, 365, 730));
  END IF;
END $$;

-- ── 3. audit_log: extend event_type ─────────────────────────────────────────
-- Drop and recreate the CHECK constraint with the new event type appended.

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
    -- Import
    'import_committed',
    -- Session
    'user_login', 'user_logout',
    -- Purchase history (M-037)
    'purchase_history_imported'
  ));
