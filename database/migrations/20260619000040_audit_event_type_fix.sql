-- M-040: Add missing audit_log event_type values
--
-- Root cause: valuation-reports/[id]/approve and valuation-reports/[id]/lock
-- both emit event_type = 'status_change', which was never added to the
-- audit_log_event_type_check constraint. Every approve or lock of a valuation
-- report silently fails on the audit insert (Supabase raises a CHECK violation).
--
-- Also adds 'price_list_version_created' (was in M-033 constraint but not emitted
-- by code — pre-registering for consistency). 'purchase_history_imported' was
-- added in M-038 but is not yet emitted by any route — kept for consistency.
--
-- Strategy: replace generic 'status_change' with specific event names in code (M-040b).
-- This migration adds 'valuation_report_approved' and 'valuation_report_locked'
-- to the constraint so the code routes can be updated to use precise names.
--
-- Additive, idempotent. Pattern identical to M-033 and M-038.

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

    -- Valuation report governance (NEW — was 'status_change' in routes, now specific)
    'valuation_report_approved', 'valuation_report_locked',

    -- Warehouse
    'warehouse_created', 'warehouse_updated', 'warehouse_archived', 'warehouse_restored',

    -- FX
    'fx_rate_upserted',

    -- Import events
    'import_committed',
    'purchase_history_imported',

    -- Session
    'user_login', 'user_logout',

    -- Manufacturing structures (M-038)
    'mfg_structure_created',
    'mfg_structure_updated',
    'mfg_structure_activated'
  ));
