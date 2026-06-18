-- M-018: validation_runs, validation_findings
-- Validation engine output tables. ADR-105: validation is separate from the cost engine.
-- OQ-07 resolved: findings auto-resolve on next successful validation run when underlying issue is fixed.

-- ─── validation_runs ─────────────────────────────────────────────────────────

CREATE TABLE validation_runs (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL,
  run_type         text        NOT NULL,
  scope_type       text        NOT NULL,
  scope_id         uuid        NULL,
  triggered_by     uuid        NULL,
  triggered_at     timestamptz NOT NULL,
  completed_at     timestamptz NULL,
  status           text        NOT NULL DEFAULT 'running',
  total_findings   integer     NOT NULL DEFAULT 0,
  error_count      integer     NOT NULL DEFAULT 0,
  warning_count    integer     NOT NULL DEFAULT 0,
  info_count       integer     NOT NULL DEFAULT 0,
  engine_version   text        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT validation_runs_pkey
    PRIMARY KEY (id),
  CONSTRAINT validation_runs_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT validation_runs_triggered_by_fkey
    FOREIGN KEY (triggered_by) REFERENCES profiles(id),
  CONSTRAINT validation_runs_run_type_check
    CHECK (run_type IN ('on_demand', 'pre_calculation', 'pre_approval', 'scheduled')),
  CONSTRAINT validation_runs_scope_type_check
    CHECK (scope_type IN (
      'organization', 'sku', 'bom_version', 'cost_set', 'inventory_snapshot'
    )),
  CONSTRAINT validation_runs_status_check
    CHECK (status IN ('running', 'completed', 'failed'))
);

-- No updated_at: written by system; status transitions are append-completed-at.
COMMENT ON TABLE validation_runs IS
  'Single execution of the validation engine. Triggered on-demand, pre-calculation, pre-approval, or scheduled.';

-- ─── validation_findings ─────────────────────────────────────────────────────

CREATE TABLE validation_findings (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id       uuid        NOT NULL,
  validation_run_id     uuid        NOT NULL,
  rule_id               text        NOT NULL,
  rule_name             text        NOT NULL,
  severity              text        NOT NULL,
  category              text        NOT NULL,
  entity_type           text        NOT NULL,
  entity_id             uuid        NULL,
  entity_display_name   text        NULL,
  message               text        NOT NULL,
  detail                jsonb       NULL,
  can_auto_fix          boolean     NOT NULL DEFAULT false,
  auto_fix_applied      boolean     NOT NULL DEFAULT false,
  status                text        NOT NULL DEFAULT 'open',
  resolved_by           uuid        NULL,
  resolved_at           timestamptz NULL,
  resolution_notes      text        NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT validation_findings_pkey
    PRIMARY KEY (id),
  CONSTRAINT validation_findings_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT validation_findings_validation_run_id_fkey
    FOREIGN KEY (validation_run_id) REFERENCES validation_runs(id),
  CONSTRAINT validation_findings_resolved_by_fkey
    FOREIGN KEY (resolved_by) REFERENCES profiles(id),
  CONSTRAINT validation_findings_severity_check
    CHECK (severity IN ('error', 'warning', 'info')),
  CONSTRAINT validation_findings_category_check
    CHECK (category IN ('structural', 'business', 'cost', 'inventory')),
  CONSTRAINT validation_findings_status_check
    CHECK (status IN ('open', 'acknowledged', 'resolved', 'suppressed'))
);

-- No updated_at: findings are resolved by status transitions (resolved_by/resolved_at).
COMMENT ON TABLE validation_findings IS
  'Single data quality issue from a validation run. Auto-resolved on next successful run if issue is fixed (OQ-07).';
COMMENT ON COLUMN validation_findings.rule_id IS
  'Validation rule code (e.g., V-BOM-001, V-COST-003). Stable identifier for the rule that fired.';
