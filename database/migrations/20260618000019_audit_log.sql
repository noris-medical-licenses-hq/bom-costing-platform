-- M-019: audit_log
-- Append-only, immutable record of every data mutation in the system.
-- Written by database triggers (M-022) on all business tables.
-- ADR-005: DB trigger guarantees audit coverage regardless of code path.
-- Immutability: RLS blocks UPDATE and DELETE for all roles (enforced in M-021).
-- Retention: 7 years minimum (EU MDR / medical device regulatory requirement).

CREATE TABLE audit_log (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL,
  event_type       text        NOT NULL,
  event_category   text        NOT NULL,
  table_name       text        NULL,
  record_id        uuid        NULL,
  performed_by     uuid        NULL,
  performed_at     timestamptz NOT NULL DEFAULT now(),
  session_id       text        NULL,
  ip_address       text        NULL,
  old_values       jsonb       NULL,
  new_values       jsonb       NULL,
  change_delta     jsonb       NULL,
  reference_id     uuid        NULL,
  metadata         jsonb       NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT audit_log_pkey
    PRIMARY KEY (id),
  CONSTRAINT audit_log_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
  -- performed_by is nullable (NULL for system-triggered events)
  CONSTRAINT audit_log_event_type_check
    CHECK (event_type IN (
      'data_insert', 'data_update', 'data_delete',
      'bom_approved', 'bom_superseded',
      'snapshot_approved',
      'rule_activated', 'rule_deactivated',
      'exception_approved', 'exception_rejected',
      'calculation_executed', 'valuation_executed',
      'user_invited', 'user_role_changed', 'user_deactivated',
      'cost_set_locked', 'adjustment_approved'
    )),
  CONSTRAINT audit_log_event_category_check
    CHECK (event_category IN (
      'data', 'workflow', 'rule', 'calculation', 'valuation', 'admin'
    ))
);

-- No updated_at column: this table is append-only. Rows are never modified after insertion.
-- UPDATE and DELETE blocked by RLS policies in M-021 (C-11).
-- No trigger on this table itself (would cause recursive logging).

-- Non-clustered index on performed_at (most common query filter)
COMMENT ON TABLE audit_log IS
  'Append-only mutation history. No UPDATE or DELETE permitted by any role. 7-year retention minimum.';
COMMENT ON COLUMN audit_log.performed_by IS
  'NULL for system-triggered events (scheduled jobs, system triggers). FK omitted to allow NULL.';
COMMENT ON COLUMN audit_log.change_delta IS
  'JSONB containing only the keys whose values changed (for UPDATE events). Derived at write time.';
COMMENT ON COLUMN audit_log.reference_id IS
  'Associated record: trace_id for calculation events, snapshot_id for valuation events, etc.';
